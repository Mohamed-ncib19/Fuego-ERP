import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { desc, eq, and } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { auditLogs } from "../db/schema";
import { countExpr } from "../db/sqlite.util";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  prevValues?: unknown;
  newValues?: unknown;
  meta?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  /**
   * Appends one audit row. Failing the write must never fail the business
   * operation it describes — the catch keeps the request alive and logs.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.client.insert(auditLogs).values({
        id: randomUUID(),
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        entity_label: entry.entityLabel ?? null,
        actor_id: entry.actorId ?? null,
        actor_label: entry.actorLabel ?? null,
        actor_role: entry.actorRole ?? null,
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
        prev_values: entry.prevValues !== undefined ? JSON.stringify(entry.prevValues) : null,
        new_values: entry.newValues !== undefined ? JSON.stringify(entry.newValues) : null,
        meta: entry.meta !== undefined ? JSON.stringify(entry.meta) : null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[audit] failed to record entry:", err);
    }
  }

  /** Paginated + filtered trail for the admin viewer (Phase 3 UI). */
  async list(params: {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
    actorId?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
    const filters = [];
    if (params.action) filters.push(eq(auditLogs.action, params.action));
    if (params.entityType) filters.push(eq(auditLogs.entity_type, params.entityType));
    if (params.actorId) filters.push(eq(auditLogs.actor_id, params.actorId));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [countRow]] = await Promise.all([
      this.db.client
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.created_at))
        .offset((page - 1) * limit)
        .limit(limit),
      this.db.client.select({ count: countExpr() }).from(auditLogs).where(where),
    ]);
    return {
      data: rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() })),
      meta: {
        total: countRow.count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(countRow.count / limit)),
      },
    };
  }
}
