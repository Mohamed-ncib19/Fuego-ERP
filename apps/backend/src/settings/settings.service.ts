import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import fs, { unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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

  async createBackupFile(): Promise<string> {
    const tempPath = path.join(os.tmpdir(), `fuego-backup-${Date.now()}.db`);
    await this.db.backupTo(tempPath);
    return tempPath;
  }

  async restoreDb(fileBase64: string, actor: Actor): Promise<{ ok: boolean; message: string }> {
    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length < 100) {
      throw new BadRequestException("Fichier de sauvegarde invalide");
    }

    const header = buffer.subarray(0, 16).toString("utf-8");
    if (!header.startsWith("SQLite format 3")) {
      throw new BadRequestException("Format de fichier non reconnu (doit être une base SQLite)");
    }

    const tempPath = path.join(os.tmpdir(), `restore-${Date.now()}.db`);
    fs.writeFileSync(tempPath, buffer);

    try {
      const testDb = new Database(tempPath, { readonly: true });
      testDb.prepare("SELECT count(*) FROM sqlite_master").get();
      testDb.close();
    } catch {
      try { unlinkSync(tempPath); } catch {}
      throw new BadRequestException("Le fichier de base de données est corrompu");
    }

    const dbPath = this.db.getDbPath();
    this.db.close();

    try {
      fs.copyFileSync(tempPath, dbPath);
      try { unlinkSync(tempPath); } catch {}
      try { unlinkSync(`${dbPath}-wal`); } catch {}
      try { unlinkSync(`${dbPath}-shm`); } catch {}
    } catch (err) {
      this.db.reopen();
      throw new BadRequestException("Échec du remplacement de la base de données");
    }

    this.db.reopen();

    await this.audit.record({
      action: "database.restored",
      entityType: "database",
      entityId: "fuego.db",
      entityLabel: "Restauration base de données",
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
    });

    return { ok: true, message: "Base de données restaurée avec succès" };
  }
}
