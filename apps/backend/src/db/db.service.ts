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
 * fresh install or a DB path change never starts broken. Schema changes
 * beyond Phase 0 go through drizzle-kit push (dev) / migrations (prod). */
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
  `);
}
