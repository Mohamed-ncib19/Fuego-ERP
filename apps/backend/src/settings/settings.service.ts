import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { settings } from "../db/schema";
import { AuditService } from "../audit/audit.service";
import type { UpdateSettingsDto } from "./dto/settings.dto";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Public (login screen shows the business name). Returns defaults until
   * the first-run wizard has run. */
  async get() {
    const row = await this.db.client.query.settings.findFirst({
      where: eq(settings.id, "default"),
    });
    return row ?? { id: "default", business_name: "Fuego", currency: "TND", ticket_footer: null };
  }

  async update(dto: UpdateSettingsDto, actor: Actor) {
    const current = await this.db.client.query.settings.findFirst({
      where: eq(settings.id, "default"),
    });
    if (!current) throw new NotFoundException("Paramètres introuvables");
    const [updated] = await this.db.client
      .update(settings)
      .set({
        ...(dto.business_name !== undefined && { business_name: dto.business_name.trim() }),
        ...(dto.ticket_footer !== undefined && { ticket_footer: dto.ticket_footer }),
        updated_at: new Date(),
      })
      .where(eq(settings.id, "default"))
      .returning();
    await this.audit.record({
      action: "settings.updated",
      entityType: "settings",
      entityId: "default",
      entityLabel: updated.business_name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      prevValues: { business_name: current.business_name, ticket_footer: current.ticket_footer },
      newValues: { business_name: updated.business_name, ticket_footer: updated.ticket_footer },
    });
    return updated;
  }
}
