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
 * Phase 0 ships users, audit_logs, settings and counters. Phase 1 adds
 * orders, order_items, order_events and payments; expenses arrive in Phase 2
 * as additive-only changes.
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

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey().notNull(),
    /** Human ticket number, unique; the year-scoped sequence lives in `counters`. */
    ticket_no: text("ticket_no").notNull(),
    ticket_year: integer("ticket_year").notNull(),
    ticket_seq: integer("ticket_seq").notNull(),
    /** Empty string when the draft was saved before the customer was known. */
    customer_name: text("customer_name").notNull(),
    customer_phone: text("customer_phone"),
    description: text("description"),
    /** OrderType: "local" | "online" — constrained in code, not by SQLite. */
    order_type: text("order_type").notNull(),
    /** Required iff `order_type = "online"` (service rule). */
    delivery_address: text("delivery_address"),
    /** Integer millimes, kept separate from articles; 0 when local. */
    delivery_fee: integer("delivery_fee").notNull().default(0),
    /** Σ(quantity × unit_price) in millimes, maintained in code. */
    total_amount: integer("total_amount").notNull(),
    /** OrderStatus: constrained in code, not by SQLite. */
    status: text("status").notNull().default("pending"),
    /** `YYYY-MM-DD` promise date. */
    due_date: text("due_date"),
    created_by: text("created_by").notNull(),
    /** Set once, when the order leaves `pending`. */
    confirmed_by: text("confirmed_by"),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
    updated_at: tsMs("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("orders_ticket_no_key").on(table.ticket_no),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.created_at),
    index("orders_customer_name_idx").on(table.customer_name),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey().notNull(),
    order_id: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Display order, zero-based; reindexed whenever items are replaced. */
    position: integer("position").notNull(),
    label: text("label").notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** Integer millimes, ≥ 0. */
    unit_price: integer("unit_price").notNull(),
  },
  (table) => [index("order_items_order_id_idx").on(table.order_id)],
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey().notNull(),
    order_id: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** OrderEventType — append-only; constrained in code, not by SQLite. */
    type: text("type").notNull(),
    /** JSON text: `{before, after}` diffs, notes, `{forced: true}` metadata. */
    payload: text("payload"),
    actor_id: text("actor_id").notNull(),
    actor_label: text("actor_label").notNull(),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("order_events_order_id_idx").on(table.order_id)],
);

/** Immutable money ledger: corrections happen by adding refund rows. */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey().notNull(),
    order_id: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** PaymentKind: "advance" | "balance" | "refund" — refund subtracts. */
    kind: text("kind").notNull(),
    /** Integer millimes, always ≥ 1. */
    amount: integer("amount").notNull(),
    /** e.g. "espèces", "chèque #123". */
    note: text("note"),
    recorded_by: text("recorded_by").notNull(),
    recorded_by_label: text("recorded_by_label").notNull(),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("payments_order_id_idx").on(table.order_id)],
);
