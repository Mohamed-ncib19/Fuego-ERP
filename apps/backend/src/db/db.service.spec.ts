import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { DbService } from "./db.service";

/**
 * The shipped desktop database has no migration runner — its schema is
 * whatever ensureTables() creates at boot. These assertions are the guard
 * that Phase 1's four tables and the ticket unique index reach every install.
 */
describe("DbService boot-time schema (Phase 1)", () => {
  let db: DbService;

  beforeAll(() => {
    process.env.DB_PATH = ":memory:";
    db = new DbService();
  });

  afterAll(() => {
    db.raw.close();
  });

  function masterRows(sqlite: Database.Database) {
    return sqlite.prepare("SELECT type, name FROM sqlite_master").all() as Array<{
      type: string;
      name: string;
    }>;
  }

  function insertOrder(sqlite: Database.Database, id: string, ticketNo: string) {
    sqlite
      .prepare(
        `INSERT INTO orders
           (id, ticket_no, ticket_year, ticket_seq, customer_name, order_type,
            total_amount, created_by, created_at, updated_at)
         VALUES (?, ?, 2026, 1, 'Client test', 'local', 0, 'actor-1', ?, ?)`,
      )
      .run(id, ticketNo, Date.now(), Date.now());
  }

  it("creates the orders, order_items, order_events and payments tables", () => {
    const names = masterRows(db.raw)
      .filter((row) => row.type === "table")
      .map((row) => row.name);

    expect(names).toEqual(
      expect.arrayContaining(["orders", "order_items", "order_events", "payments"]),
    );
  });

  it("creates a unique orders_ticket_no_key index", () => {
    const index = masterRows(db.raw).find((row) => row.name === "orders_ticket_no_key");
    expect(index?.type).toBe("index");

    const indexList = db.raw.prepare("PRAGMA index_list(orders)").all() as Array<{
      name: string;
      unique: number;
    }>;
    const ticketIndex = indexList.find((row) => row.name === "orders_ticket_no_key");
    expect(ticketIndex?.unique).toBe(1);
  });

  it("rejects a second order with the same ticket number", () => {
    insertOrder(db.raw, "order-a", "CMD-2026-0001");

    expect(() => insertOrder(db.raw, "order-b", "CMD-2026-0001")).toThrow(
      /UNIQUE constraint failed: orders\.ticket_no/,
    );
  });

  it("defaults delivery_fee to 0 and status to pending", () => {
    insertOrder(db.raw, "order-defaults", "CMD-2026-0002");

    const row = db.raw
      .prepare("SELECT delivery_fee, status FROM orders WHERE id = ?")
      .get("order-defaults") as { delivery_fee: number; status: string };

    expect(row).toEqual({ delivery_fee: 0, status: "pending" });
  });
});
