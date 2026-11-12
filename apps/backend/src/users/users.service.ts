import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { DbService } from "../db/db.service";
import { users } from "../db/schema";
import { countExpr } from "../db/sqlite.util";
import { AuditService } from "../audit/audit.service";
import { publicUser } from "../auth/auth.service";
import type { CreateUserDto, UpdateUserDto } from "./dto/users.dto";
import type { SafeUser, UserRole } from "@fuego/shared";

function bcryptRounds(): number {
  const raw = Number(process.env.BCRYPT_ROUNDS);
  return Number.isInteger(raw) && raw >= 4 && raw <= 31 ? raw : 10;
}

interface Actor {
  id: string;
  full_name: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async listUsers(params: { page?: number; limit?: number; search?: string } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
    const term = params.search?.trim();
    const where = term
      ? sql`(lower(${users.full_name}) like ${"%" + term.toLowerCase() + "%"}
             or lower(${users.email}) like ${"%" + term.toLowerCase() + "%"})`
      : undefined;
    const [rows, [countRow]] = await Promise.all([
      this.db.client
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.created_at))
        .offset((page - 1) * limit)
        .limit(limit),
      this.db.client.select({ count: countExpr() }).from(users).where(where),
    ]);
    return {
      data: rows.map((r) => publicUser(r)),
      meta: {
        total: countRow.count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(countRow.count / limit)),
      },
    };
  }

  async getUser(id: string): Promise<SafeUser> {
    const user = await this.db.client.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) throw new NotFoundException("Utilisateur introuvable");
    return publicUser(user);
  }

  async createUser(dto: CreateUserDto, actor: Actor): Promise<SafeUser> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.db.client.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (existing) throw new ConflictException("Cet e-mail est déjà utilisé par un autre compte");

    if (dto.role === "super_admin") {
      // A second master key only with the current admin's own password.
      await this.requireActorPassword(actor.id, dto.admin_password);
    }

    const password_hash = await hash(dto.password, bcryptRounds());
    const [created] = await this.db.client
      .insert(users)
      .values({
        id: randomUUID(),
        full_name: dto.full_name.trim(),
        email,
        password_hash,
        role: dto.role,
      })
      .returning();

    await this.audit.record({
      action: "user.created",
      entityType: "user",
      entityId: created.id,
      entityLabel: created.full_name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      newValues: { email: created.email, role: created.role },
    });
    return publicUser(created);
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: Actor): Promise<SafeUser> {
    const target = await this.db.client.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) throw new NotFoundException("Utilisateur introuvable");

    if (id === actor.id && (dto.role !== undefined || dto.is_active === false)) {
      throw new ForbiddenException(
        "Vous ne pouvez pas modifier votre propre rôle ni vous désactiver",
      );
    }
    if (dto.role !== undefined || dto.is_active === false) {
      await this.requireActiveSuperAdminRemains(id);
    }
    if (dto.role === "super_admin" && target.role !== dto.role) {
      await this.requireActorPassword(actor.id, dto.admin_password);
    }
    if (dto.email && dto.email.trim().toLowerCase() !== target.email) {
      const clash = await this.db.client.query.users.findFirst({
        where: eq(users.email, dto.email.trim().toLowerCase()),
        columns: { id: true },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException("Cet e-mail est déjà utilisé par un autre compte");
      }
    }

    const [updated] = await this.db.client
      .update(users)
      .set({
        ...(dto.full_name !== undefined && { full_name: dto.full_name.trim() }),
        ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        // A role or status change evicts the user's sessions: a demoted
        // employee must not keep acting on a tab left open.
        ...((dto.role !== undefined || dto.is_active === false) && {
          tokens_valid_after: new Date(),
        }),
      })
      .where(eq(users.id, id))
      .returning();

    await this.audit.record({
      action: "user.updated",
      entityType: "user",
      entityId: id,
      entityLabel: updated.full_name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      prevValues: { role: target.role, is_active: target.is_active, email: target.email },
      newValues: { role: updated.role, is_active: updated.is_active, email: updated.email },
    });
    return publicUser(updated);
  }

  async resetUserPassword(id: string, newPassword: string, actor: Actor) {
    if (id === actor.id) {
      throw new ForbiddenException(
        "Utilisez « changer le mot de passe » pour votre propre compte",
      );
    }
    const target = await this.db.client.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) throw new NotFoundException("Utilisateur introuvable");
    const password_hash = await hash(newPassword, bcryptRounds());
    await this.db.client
      .update(users)
      .set({ password_hash, tokens_valid_after: new Date() })
      .where(eq(users.id, id));
    await this.audit.record({
      action: "user.password_reset",
      entityType: "user",
      entityId: id,
      entityLabel: target.full_name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
    });
    return { ok: true, message: "Mot de passe réinitialisé" };
  }

  /** The acting admin proves identity before minting another super_admin. */
  private async requireActorPassword(actorId: string, password: string | undefined) {
    if (!password) {
      throw new ForbiddenException(
        "La création d'un administrateur exige votre propre mot de passe",
      );
    }
    const actor = await this.db.client.query.users.findFirst({
      where: eq(users.id, actorId),
    });
    if (!actor || !(await compare(password, actor.password_hash))) {
      throw new ForbiddenException("Mot de passe administrateur incorrect");
    }
  }

  /** Refuse to strand the installation with zero active super_admins. */
  private async requireActiveSuperAdminRemains(excludedId: string) {
    const [row] = await this.db.client
      .select({ count: countExpr() })
      .from(users)
      .where(
        and(eq(users.role, "super_admin"), eq(users.is_active, true), ne(users.id, excludedId)),
      );
    if (row.count === 0) {
      throw new ForbiddenException("Impossible : ce serait le dernier administrateur actif");
    }
  }
}
