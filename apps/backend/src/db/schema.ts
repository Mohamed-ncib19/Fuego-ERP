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

/** Expenses (dépenses) — categorized outgoings with timestamps (Phase 2). */
export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey().notNull(),
    category: text("category").notNull(),
    amount: integer("amount").notNull(),
    note: text("note"),
    date: text("date").notNull(), // YYYY-MM-DD
    recorded_by: text("recorded_by").notNull(),
    recorded_by_label: text("recorded_by_label").notNull(),
    /**
     * Idempotency key sent by the form (one per opened form). A second submit
     * with the same key returns the first expense instead of booking it — and
     * its stock — twice. NULL for rows created before the key existed.
     */
    client_ref: text("client_ref"),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
    updated_at: tsMs("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("expenses_category_idx").on(table.category),
    index("expenses_date_idx").on(table.date),
    index("expenses_created_at_idx").on(table.created_at),
    uniqueIndex("expenses_client_ref_key").on(table.client_ref),
  ],
);

/**
 * Stock items — raw materials, supplies and articles. The quantity is never
 * stored here: it is Σ stock_movements.quantity, so it cannot drift from the
 * history.
 */
export const stockItems = sqliteTable(
  "stock_items",
  {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    /** Accent/case/space-insensitive name — unique, blocks duplicates. */
    name_key: text("name_key").notNull(),
    /** StockItemKind — constrained in code. */
    kind: text("kind").notNull().default("raw_material"),
    category: text("category"),
    /** StockUnit — constrained in code. */
    unit: text("unit").notNull(),
    /** Thousandths of the unit; 0 = no low-stock alert. */
    min_threshold: integer("min_threshold").notNull().default(0),
    note: text("note"),
    is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
    created_by: text("created_by").notNull(),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
    updated_at: tsMs("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("stock_items_name_key").on(table.name_key),
    index("stock_items_kind_idx").on(table.kind),
  ],
);

/** Purchased materials of a "materials" expense (replaced on edit). */
export const expenseLines = sqliteTable(
  "expense_lines",
  {
    id: text("id").primaryKey().notNull(),
    expense_id: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    stock_item_id: text("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "restrict" }),
    /** Thousandths of the item's unit, ≥ 1. */
    quantity: integer("quantity").notNull(),
    /** Millimes per whole unit. */
    unit_price: integer("unit_price").notNull(),
    /** Millimes. */
    line_total: integer("line_total").notNull(),
  },
  (table) => [
    index("expense_lines_expense_id_idx").on(table.expense_id),
    index("expense_lines_stock_item_id_idx").on(table.stock_item_id),
  ],
);

/**
 * Append-only stock ledger. Nothing is edited or deleted: an expense edit
 * adds a correction row, an expense deletion adds a reversal row.
 */
export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey().notNull(),
    stock_item_id: text("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "restrict" }),
    /** StockMovementKind — constrained in code. */
    kind: text("kind").notNull(),
    /** Signed thousandths of the unit (+ in, − out), never 0. */
    quantity: integer("quantity").notNull(),
    /** Millimes per unit for purchases. */
    unit_cost: integer("unit_cost"),
    reason: text("reason"),
    date: text("date").notNull(), // YYYY-MM-DD
    /** The expense that caused it; NULL once that expense is deleted. */
    expense_id: text("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    recorded_by: text("recorded_by").notNull(),
    recorded_by_label: text("recorded_by_label").notNull(),
    created_at: tsMs("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("stock_movements_item_idx").on(table.stock_item_id, table.created_at),
    index("stock_movements_expense_idx").on(table.expense_id),
    index("stock_movements_created_at_idx").on(table.created_at),
  ],
);

