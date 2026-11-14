import { Injectable } from "@nestjs/common";
import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * Single SQLite connection owned by the process. The database lives in the
 * Electron user-data folder in production; in standalone dev it lives in
 * apps/backend/data/. A lazy init keeps the path overridable via
 * DB_PATH (set by the desktop shell before NestJS boots).
 */
@Injectable()
export class DbService {
  private _raw?: Database.Database;
  private _client?: BetterSQLite3Database<typeof schema>;

  get client(): BetterSQLite3Database<typeof schema> {
    if (!this._client) this.open();
    return this._client!;
  }

  /** The raw better-sqlite3 handle — transactions / pragmas / exec. */
  get raw(): Database.Database {
    if (!this._raw) this.open();
    return this._raw!;
  }

  getDbPath(): string {
    return path.resolve(process.env.DB_PATH ?? "./data/fuego.db");
  }

  async backupTo(destPath: string): Promise<void> {
    await this.raw.backup(destPath);
  }

  close(): void {
    if (this._raw) {
      try {
        this._raw.close();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[db] error closing database:", err);
      }
      this._raw = undefined;
      this._client = undefined;
    }
  }

  reopen(): void {
    this.close();
    this.open();
  }

  private open() {
    const dbPath = process.env.DB_PATH ?? "./data/fuego.db";
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    const sqlite = new Database(dbPath);
    // Durability first — a shop cannot lose a paid advance to a crash.
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    this._raw = sqlite;
    this._client = drizzle(sqlite, { schema });
    ensureTables(sqlite);
  }
}

/** Creates every table if missing — the lightweight "push" at boot so a
 * fresh install or a DB path change never starts broken. This is the shipped
 * desktop app's only schema source (there is no migration runner);
 * schema.ts must mirror it for typed queries, and drizzle-kit push stays a
 * dev convenience. */
export function ensureTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      is_active INTEGER NOT NULL DEFAULT 1,
      tokens_valid_after INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);
    CREATE INDEX IF NOT EXISTS users_full_name_idx ON users (full_name);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      entity_label TEXT,
      actor_id TEXT,
      actor_label TEXT,
      actor_role TEXT,
      ip_address TEXT,
      user_agent TEXT,
      prev_values TEXT,
      new_values TEXT,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);
    CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      business_name TEXT NOT NULL DEFAULT 'Fuego',
      currency TEXT NOT NULL DEFAULT 'TND',
      ticket_footer TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY NOT NULL,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_no TEXT NOT NULL,
      ticket_year INTEGER NOT NULL,
      ticket_seq INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      description TEXT,
      order_type TEXT NOT NULL,
      delivery_address TEXT,
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT,
      created_by TEXT NOT NULL,
      confirmed_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS orders_ticket_no_key ON orders (ticket_no);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
    CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);
    CREATE INDEX IF NOT EXISTS orders_customer_name_idx ON orders (customer_name);

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      label TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

    CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload TEXT,
      actor_id TEXT NOT NULL,
      actor_label TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events (order_id);

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      note TEXT,
      recorded_by TEXT NOT NULL,
      recorded_by_label TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payments_order_id_idx ON payments (order_id);

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      note TEXT,
      date TEXT NOT NULL,
      recorded_by TEXT NOT NULL,
      recorded_by_label TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses (category);
    CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date);
    CREATE INDEX IF NOT EXISTS expenses_created_at_idx ON expenses (created_at);
  `);
}
