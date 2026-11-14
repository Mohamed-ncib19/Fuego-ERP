import { apiGet } from "./client";
import type { PageMeta } from "@fuego/shared";

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  actor_id: string | null;
  actor_label: string | null;
  actor_role: string | null;
  ip_address: string | null;
  user_agent: string | null;
  prev_values: string | null;
  new_values: string | null;
  meta: string | null;
  created_at: string;
}

export interface AuditFilterParams {
  action?: string;
  entityType?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}

export const auditApi = {
  list(params?: AuditFilterParams): Promise<{
    data: AuditLogRow[];
    meta: PageMeta;
  }> {
    return apiGet<AuditLogRow[], PageMeta>("/audit", params as any).then((r) => ({
      data: r.data,
      meta: r.meta as PageMeta,
    }));
  },
};
