import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

/**
 * Fuego schema — SQLite via Drizzle.
 *
 * Conventions carried over from the reference system: plural snake_case
 * tables, uuid text PKs generated in code (SQLite has no uuid default),
 * integer timestamps in epoch-ms mode, and immutable money/event rows.
 *
 * Phase 0 ships users, audit_logs, settings and counters. Orders, payments
 * and expenses arrive in Phase 1/2 as additive-only changes.
 */

/** Epoch-ms timestamps with app-side defaults (SQLite has no CURRENT_TIMESTAMP on integers). */
const tsMs = (name: string) => integer(name, { mode: "timestamp_ms" });

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().notNull(),
    full_name: text("full_name").notNull(),
    /** Stored trimmed + lowercased at creation — login must normalize identically. */
    email: text("email").notNull(),
    password_hash: text("password_hash").notNull(),
    /** UserRole: "super_admin" | "staff" — constrained in code, not by SQLite. */
    role: text("role").notNull().default("staff"),
    is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /**
     * Sessions minted before this instant are refused — the server-side
     * "log out everywhere". Set on password change / role change; NULL means
     * no floor (every existing session stays valid).
     */
    tokens_valid_after: tsMs("tokens_valid_after"),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
    updated_at: tsMs("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_key").on(table.email),
    index("users_full_name_idx").on(table.full_name),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey().notNull(),
    /** Dotted action name, e.g. "auth.login_failed", "user.created". */
    action: text("action").notNull(),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id"),
    entity_label: text("entity_label"),
    actor_id: text("actor_id"),
    actor_label: text("actor_label"),
    actor_role: text("actor_role"),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    prev_values: text("prev_values"),
    new_values: text("new_values"),
    meta: text("meta"),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.created_at),
    index("audit_logs_entity_idx").on(table.entity_type, table.entity_id),
  ],
);

export const settings = sqliteTable("settings", {
  /** Single-row table: id is always "default". */
  id: text("id").primaryKey().notNull().default("default"),
  business_name: text("business_name").notNull().default("Fuego"),
  currency: text("currency").notNull().default("TND"),
  /** Printed at the bottom of order tickets. */
  ticket_footer: text("ticket_footer"),
  updated_at: tsMs("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const counters = sqliteTable("counters", {
  /** Named sequence, e.g. "ticket_2026" — incremented in a transaction. */
  name: text("name").primaryKey().notNull(),
  value: integer("value").notNull().default(0),
});
