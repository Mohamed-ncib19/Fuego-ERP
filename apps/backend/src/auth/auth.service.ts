import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { DbService } from "../db/db.service";
import { users } from "../db/schema";
import { AuditService } from "../audit/audit.service";
import type { SafeUser, UserRole } from "@fuego/shared";
import {
  JWT_REFRESH_SECRET,
  JWT_SECRET,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from "./constants";

/** Password hashing cost — BCRYPT_ROUNDS env, clamped 4–31, default 10. */
function bcryptRounds(): number {
  const raw = Number(process.env.BCRYPT_ROUNDS);
  return Number.isInteger(raw) && raw >= 4 && raw <= 31 ? raw : 10;
}

export function publicUser(row: typeof users.$inferSelect): SafeUser {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role as UserRole,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Failed logins have no authenticated actor, so their audit rows carry a
 * null actorId with the attempted address as label — writing literal
 * "system" strings into uuid columns is what previously made every failed
 * login a 500 in the reference (lesson carried over).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async validateUser(
    rawEmail: string,
    password: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<SafeUser> {
    // Accounts are stored trimmed + lowercased (users.service), so the
    // lookup must normalize the same way or valid users get 401.
    const email = rawEmail.trim().toLowerCase();
    const user = await this.db.client.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      await this.recordFailedLogin("user_not_found", email, null, ctx);
      throw new UnauthorizedException("Identifiants invalides");
    }
    const valid = await compare(password, user.password_hash);
    if (!valid) {
      await this.recordFailedLogin("invalid_password", email, user.id, ctx);
      throw new UnauthorizedException("Identifiants invalides");
    }
    if (!user.is_active) {
      await this.recordFailedLogin("account_deactivated", email, user.id, ctx);
      throw new UnauthorizedException("Votre compte a été désactivé");
    }
    // A successful sign-in clears the revocation floor — the person typing
    // the current password just proved the credential is live.
    if (user.tokens_valid_after) {
      await this.db.client
        .update(users)
        .set({ tokens_valid_after: null })
        .where(eq(users.id, user.id));
    }
    await this.auditService.record({
      action: "auth.login_success",
      entityType: "user",
      entityId: user.id,
      entityLabel: user.full_name,
      actorId: user.id,
      actorLabel: user.full_name,
      actorRole: user.role,
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      meta: { email },
    });
    return publicUser(user);
  }

  async login(user: SafeUser) {
    const tokens = this.mintTokens(user);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    };
  }

  /** Access + rotating refresh tokens. `type: "refresh"` marks the pair so
   * a refresh token can never be replayed as an access token. */
  private mintTokens(user: SafeUser) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload, {
      secret: JWT_SECRET(),
      expiresIn: ACCESS_TTL_SECONDS,
    });
    const refresh_token = this.jwtService.sign(
      { ...payload, type: "refresh" },
      { secret: JWT_REFRESH_SECRET(), expiresIn: REFRESH_TTL_SECONDS },
    );
    return { access_token, refresh_token };
  }

  /** Exchanges a still-valid refresh cookie for a fresh pair (rotation on
   * every call kills a stolen refresh token the moment it is reused). */
  async refresh(refreshToken: string, userId?: string) {
    if (!refreshToken) throw new UnauthorizedException("Session expirée, veuillez vous reconnecter");
    let payload: { sub: string; type?: string; iat?: number };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: JWT_REFRESH_SECRET(),
      });
    } catch {
      throw new UnauthorizedException("Session expirée, veuillez vous reconnecter");
    }
    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Session invalide, veuillez vous reconnecter");
    }
    const user = await this.db.client.query.users.findFirst({
      where: eq(users.id, payload.sub),
    });
    if (!user || !user.is_active) {
      throw new UnauthorizedException("Le compte est inactif ou n'existe pas");
    }
    // Refresh must not resurrect a session the floor killed.
    if (user.tokens_valid_after && payload.iat !== undefined) {
      if (payload.iat * 1000 < user.tokens_valid_after.getTime()) {
        throw new UnauthorizedException("Session révoquée — veuillez vous reconnecter");
      }
      await this.db.client
        .update(users)
        .set({ tokens_valid_after: null })
        .where(eq(users.id, user.id));
    }
    const tokens = this.mintTokens(publicUser(user));
    return {
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    };
  }

  async me(userId: string): Promise<SafeUser> {
    const user = await this.db.client.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException("Utilisateur introuvable");
    return publicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.db.client.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException("Utilisateur introuvable");

    const valid = await compare(currentPassword, user.password_hash);
    if (!valid) {
      await this.auditService.record({
        action: "auth.change_password_failed",
        entityType: "user",
        entityId: userId,
        entityLabel: user.full_name,
        actorId: userId,
        meta: { reason: "incorrect_current_password" },
      });
      throw new UnauthorizedException("Le mot de passe actuel est incorrect");
    }

    const password_hash = await hash(newPassword, bcryptRounds());
    // The floor evicts every session minted before now — including the one
    // making this request. That is the point: a stolen laptop loses its
    // 30-day refresh cookie the moment the password changes.
    await this.db.client
      .update(users)
      .set({ password_hash, tokens_valid_after: new Date() })
      .where(eq(users.id, userId));

    await this.auditService.record({
      action: "auth.change_password_success",
      entityType: "user",
      entityId: userId,
      entityLabel: user.full_name,
      actorId: userId,
    });
    return { ok: true, message: "Mot de passe modifié avec succès" };
  }

  async log(userId: string, action: string, ctx?: { ip?: string | null; userAgent?: string | null }) {
    await this.auditService.record({
      action,
      entityType: "user",
      entityId: userId,
      actorId: userId,
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });
  }

  private async recordFailedLogin(
    reason: string,
    email: string,
    userId: string | null,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ) {
    await this.auditService.record({
      action: "auth.login_failed",
      entityType: "user",
      entityId: userId,
      entityLabel: email,
      actorId: null,
      actorLabel: `anonymous (${email})`,
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      meta: { reason, email },
    });
  }

  /** First super_admin — only callable while zero users exist (setup module
   * guards that). Kept here so minting logic lives in one place. */
  async createInitialAdmin(data: {
    full_name: string;
    email: string;
    password: string;
  }) {
    const email = data.email.trim().toLowerCase();
    const existing = await this.db.client.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (existing) {
      throw new ConflictException("Un compte avec cet e-mail existe déjà");
    }
    const password_hash = await hash(data.password, bcryptRounds());
    const [user] = await this.db.client
      .insert(users)
      .values({
        id: randomUUID(),
        full_name: data.full_name.trim(),
        email,
        password_hash,
        role: "super_admin",
      })
      .returning();
    return publicUser(user);
  }
}
