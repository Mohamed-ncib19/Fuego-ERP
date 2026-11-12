import { ForbiddenException, Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { settings, users } from "../db/schema";
import { countExpr } from "../db/sqlite.util";
import { AuthService } from "../auth/auth.service";
import { AuditService } from "../audit/audit.service";
import type { SetupAdminDto } from "./dto/setup.dto";

/**
 * First-run wizard backend: exactly one chance to create the business and
 * its first administrator — refused forever once a user exists (the
 * installer wizard of the reference had the same gate).
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly db: DbService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  async needsSetup(): Promise<boolean> {
    const [row] = await this.db.client
      .select({ count: countExpr() })
      .from(users);
    return row.count === 0;
  }

  async complete(
    dto: SetupAdminDto,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ) {
    if (!(await this.needsSetup())) {
      throw new ForbiddenException("L'installation a déjà été configurée");
    }
    const admin = await this.authService.createInitialAdmin({
      full_name: dto.full_name,
      email: dto.email,
      password: dto.password,
    });
    // Lazily upsert the single settings row with the business identity.
    await this.db.client
      .insert(settings)
      .values({ id: "default", business_name: dto.business_name.trim() })
      .onConflictDoUpdate({
        target: settings.id,
        set: { business_name: dto.business_name.trim(), updated_at: new Date() },
      });
    await this.audit.record({
      action: "setup.completed",
      entityType: "user",
      entityId: admin.id,
      entityLabel: admin.full_name,
      actorId: admin.id,
      actorLabel: admin.full_name,
      actorRole: admin.role,
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      meta: { business_name: dto.business_name.trim() },
    });
    return { admin };
  }
}
