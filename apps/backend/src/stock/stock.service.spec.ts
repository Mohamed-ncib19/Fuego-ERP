import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { ConflictException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { DbService, ensureTables } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import { ExpensesService } from "../expenses/expenses.service";
import { StockService } from "./stock.service";
import { diffByItem, lineTotal, nameKey, netByItem } from "./stock.math";

const admin = { id: "admin-1", full_name: "Admin", role: "super_admin" as const };
const staff = { id: "staff-1", full_name: "Employé", role: "staff" as const };
const kg = (n: number) => Math.round(n * 1000);

describe("stock math", () => {
  it("normalizes names so variants collide", () => {
    expect(nameKey("  Tissu   Coton ")).toBe("tissu coton");
    expect(nameKey("Tîssu COTON")).toBe("tissu coton");
  });

  it("computes line totals in millimes from thousandths of a unit", () => {
    expect(lineTotal(kg(2.5), 12_000)).toBe(30_000); // 2,5 kg × 12 DT
    expect(lineTotal(kg(1), 333)).toBe(333);
    expect(lineTotal(kg(0.333), 1_000)).toBe(333);
  });

  it("diffs per-item quantities", () => {
    const before = netByItem([
      { stock_item_id: "a", quantity: 5 },
      { stock_item_id: "b", quantity: 3 },
    ]);
    const after = netByItem([
      { stock_item_id: "a", quantity: 8 },
      { stock_item_id: "c", quantity: 2 },
    ]);
    expect(Object.fromEntries(diffByItem(before, after))).toEqual({ a: 3, b: -3, c: 2 });
  });
});

describe("StockService + ExpensesService integration", () => {
  let db: DbService;
  let stock: StockService;
  let expenses: ExpensesService;

  beforeAll(() => {
    process.env.DB_PATH = ":memory:";
    db = new DbService();
    const audit = new AuditService(db);
    stock = new StockService(db, audit);
    expenses = new ExpensesService(db, audit, stock);
  });

  afterAll(() => db.raw.close());

  const qty = async (id: string) => (await stock.getItem(id)).quantity;
  const movementsOf = async (id: string) => (await stock.listMovements({ itemId: id, limit: 200 })).data;

  // 1 — manual raw material appears in stock with its initial quantity
  it("creates a raw material with an initial quantity booked as a movement", async () => {
    const item = await stock.createItem(
      { name: "Fil polyester", unit: "kg", initial_quantity: kg(4), min_threshold: kg(1) },
      staff,
    );
    expect(item.quantity).toBe(kg(4));
    expect(item.level).toBe("ok");
    const mv = await movementsOf(item.id);
    expect(mv).toHaveLength(1);
    expect(mv[0].kind).toBe("initial");
    expect(mv[0].balance_after).toBe(kg(4));

    const list = await stock.listItems({ scope: "materials" });
    expect(list.data.map((i) => i.id)).toContain(item.id);
  });

  it("refuses a duplicate name regardless of case and accents", async () => {
    await expect(stock.createItem({ name: "fîl  POLYESTER", unit: "kg" }, staff)).rejects.toThrow(
      ConflictException,
    );
  });

  // 2 & 3 — materials expense with several lines feeds each item
  it("books every line of a materials expense into the stock, atomically with the expense", async () => {
    const thread = (await stock.listItems({ search: "fil polyester" })).data[0];
    const exp = await expenses.create(
      {
        category: "materials",
        date: "2026-11-20",
        note: "Fournisseur Ben Ali",
        lines: [
          { stock_item_id: thread.id, quantity: kg(2.5), unit_price: 12_000 },
          { new_item: { name: "Papier A4", unit: "pack" }, quantity: kg(10), unit_price: 9_500 },
        ],
      },
      staff,
    );

    expect(exp.amount).toBe(30_000 + 95_000);
    expect(exp.lines).toHaveLength(2);
    expect(await qty(thread.id)).toBe(kg(6.5));

    const paper = (await stock.listItems({ search: "papier a4" })).data[0];
    expect(paper.quantity).toBe(kg(10));
    expect(paper.last_unit_cost).toBe(9_500);

    const mv = await stock.listMovements({ expenseId: exp.id });
    expect(mv.data.map((m) => m.kind).sort()).toEqual(["purchase", "purchase"]);
  });

  it("links a 'new' material to the existing one of the same name instead of duplicating it", async () => {
    const before = (await stock.listItems({})).data.length;
    const exp = await expenses.create(
      {
        category: "materials",
        lines: [{ new_item: { name: "papier a4", unit: "pack" }, quantity: kg(1), unit_price: 9_500 }],
      },
      staff,
    );
    expect((await stock.listItems({})).data.length).toBe(before);
    const paper = (await stock.listItems({ search: "papier a4" })).data[0];
    expect(exp.lines[0].stock_item_id).toBe(paper.id);
    expect(paper.quantity).toBe(kg(11));
  });

  // 4 — other categories never touch the stock
  it("leaves the stock alone for other categories and refuses lines on them", async () => {
    const snapshot = (await stock.listItems({})).data.map((i) => [i.id, i.quantity]);
    await expenses.create({ category: "rent", amount: 500_000 }, staff);
    expect((await stock.listItems({})).data.map((i) => [i.id, i.quantity])).toEqual(snapshot);

    const paper = (await stock.listItems({ search: "papier a4" })).data[0];
    await expect(
      expenses.create(
        { category: "utilities", lines: [{ stock_item_id: paper.id, quantity: 1000, unit_price: 1 }] },
        staff,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("still accepts a materials expense without lines (legacy behaviour)", async () => {
    const e = await expenses.create({ category: "materials", amount: 4_000 }, staff);
    expect(e.lines).toEqual([]);
    expect(e.amount).toBe(4_000);
  });

  // 5 — editing re-books only the difference
  it("re-books only the difference when an expense is edited", async () => {
    const ink = await stock.createItem({ name: "Encre noire", unit: "ml" }, staff);
    const glue = await stock.createItem({ name: "Colle", unit: "l" }, staff);
    const exp = await expenses.create(
      {
        category: "materials",
        lines: [
          { stock_item_id: ink.id, quantity: kg(500), unit_price: 50 },
          { stock_item_id: glue.id, quantity: kg(2), unit_price: 8_000 },
        ],
      },
      staff,
    );
    expect(await qty(ink.id)).toBe(kg(500));
    expect(await qty(glue.id)).toBe(kg(2));

    // ink 500 → 750 ml, glue removed, unchanged price of nothing else
    const edited = await expenses.update(
      exp.id,
      { lines: [{ stock_item_id: ink.id, quantity: kg(750), unit_price: 50 }] },
      staff,
    );
    expect(edited.amount).toBe(lineTotal(kg(750), 50));
    expect(await qty(ink.id)).toBe(kg(750));
    expect(await qty(glue.id)).toBe(0);

    const corrections = (await stock.listMovements({ expenseId: exp.id })).data.filter(
      (m) => m.kind === "purchase_correction",
    );
    expect(corrections.map((m) => m.quantity).sort((a, b) => a - b)).toEqual([-kg(2), kg(250)]);

    // Same edit replayed → no new movement
    const countBefore = (await stock.listMovements({ expenseId: exp.id })).meta.total;
    await expenses.update(exp.id, { lines: [{ stock_item_id: ink.id, quantity: kg(750), unit_price: 60 }] }, staff);
    expect((await stock.listMovements({ expenseId: exp.id })).meta.total).toBe(countBefore);
    expect((await stock.getItem(ink.id)).last_unit_cost).toBe(60);
  });

  it("moving an expense out of the materials category removes its stock", async () => {
    const tape = await stock.createItem({ name: "Ruban adhésif", unit: "roll" }, staff);
    const exp = await expenses.create(
      { category: "materials", lines: [{ stock_item_id: tape.id, quantity: kg(5), unit_price: 2_000 }] },
      staff,
    );
    const moved = await expenses.update(exp.id, { category: "other" }, staff);
    expect(moved.lines).toEqual([]);
    expect(moved.amount).toBe(10_000);
    expect(await qty(tape.id)).toBe(0);
  });

  // 6 — deleting reverses, and keeps the history
  it("reverses the stock when an expense is deleted and keeps the ledger", async () => {
    const box = await stock.createItem({ name: "Cartons", unit: "unit" }, staff);
    const exp = await expenses.create(
      { category: "materials", lines: [{ stock_item_id: box.id, quantity: kg(20), unit_price: 1_500 }] },
      staff,
    );
    expect(await qty(box.id)).toBe(kg(20));
    await expenses.delete(exp.id, staff);
    expect(await qty(box.id)).toBe(0);
    const mv = await movementsOf(box.id);
    expect(mv.map((m) => m.kind)).toEqual(["purchase_reversal", "purchase"]);
    expect(mv.every((m) => m.expense_id === null)).toBe(true);
  });

  it("refuses to delete/shrink an expense whose material was already used, leaving everything intact", async () => {
    const wax = await stock.createItem({ name: "Cire", unit: "kg" }, staff);
    const exp = await expenses.create(
      { category: "materials", lines: [{ stock_item_id: wax.id, quantity: kg(3), unit_price: 10_000 }] },
      staff,
    );
    await stock.recordMovement(wax.id, { type: "exit", quantity: kg(2) }, staff);
    expect(await qty(wax.id)).toBe(kg(1));

    await expect(expenses.delete(exp.id, staff)).rejects.toThrow(ConflictException);
    await expect(
      expenses.update(exp.id, { lines: [{ stock_item_id: wax.id, quantity: kg(0.5), unit_price: 10_000 }] }, staff),
    ).rejects.toThrow(ConflictException);

    // Rolled back: expense untouched, stock untouched.
    const still = await expenses.get(exp.id);
    expect(still.lines[0].quantity).toBe(kg(3));
    expect(await qty(wax.id)).toBe(kg(1));
  });

  // 7 — double submit
  it("books an expense once when the same form is submitted twice", async () => {
    const pins = await stock.createItem({ name: "Épingles", unit: "pack" }, staff);
    const payload = {
      category: "materials" as const,
      client_ref: "form-abc-123",
      lines: [{ stock_item_id: pins.id, quantity: kg(4), unit_price: 1_000 }],
    };
    const [a, b] = await Promise.all([expenses.create(payload, staff), expenses.create(payload, staff)]);
    expect(a.id).toBe(b.id);
    expect(await qty(pins.id)).toBe(kg(4));
    expect((await expenses.list({})).data.filter((e) => e.id === a.id)).toHaveLength(1);
  });

  it("rolls the whole expense back when one line fails (no half-booked stock)", async () => {
    const before = (await expenses.list({})).meta.total;
    const itemsBefore = (await stock.listItems({ includeArchived: true })).data.length;
    await expect(
      expenses.create(
        {
          category: "materials",
          lines: [
            { new_item: { name: "Boutons nacre", unit: "unit" }, quantity: kg(100), unit_price: 50 },
            { stock_item_id: "does-not-exist", quantity: kg(1), unit_price: 1 },
          ],
        },
        staff,
      ),
    ).rejects.toThrow();
    expect((await expenses.list({})).meta.total).toBe(before);
    expect((await stock.listItems({ includeArchived: true })).data.length).toBe(itemsBefore);
  });

  it("refuses the same material twice in one expense", async () => {
    const pins = (await stock.listItems({ search: "epingles" })).data[0];
    await expect(
      expenses.create(
        {
          category: "materials",
          lines: [
            { stock_item_id: pins.id, quantity: 1000, unit_price: 1 },
            { stock_item_id: pins.id, quantity: 1000, unit_price: 1 },
          ],
        },
        staff,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // 8 — manual movements & history
  it("records entries, exits and inventory counts with a running balance", async () => {
    const rope = await stock.createItem({ name: "Corde", unit: "m", min_threshold: kg(5) }, staff);
    expect((await stock.getItem(rope.id)).level).toBe("out");

    await stock.recordMovement(rope.id, { type: "entry", quantity: kg(10), reason: "Don" }, staff);
    await stock.recordMovement(rope.id, { type: "exit", quantity: kg(6), reason: "Commande" }, staff);
    expect((await stock.getItem(rope.id)).level).toBe("low");

    await expect(stock.recordMovement(rope.id, { type: "exit", quantity: kg(5) }, staff)).rejects.toThrow(
      ConflictException,
    );
    await expect(stock.recordMovement(rope.id, { type: "count", quantity: kg(3) }, staff)).rejects.toThrow(
      ForbiddenException,
    );

    const adj = await stock.recordMovement(rope.id, { type: "count", quantity: kg(3) }, admin);
    expect(adj.kind).toBe("adjustment");
    expect(adj.quantity).toBe(-kg(1));

    const mv = await movementsOf(rope.id);
    expect(mv.map((m) => m.balance_after)).toEqual([kg(3), kg(4), kg(10)]);
    expect(await qty(rope.id)).toBe(kg(3));
  });

  it("blocks unit changes once an item has movements, allows them before", async () => {
    const fresh = await stock.createItem({ name: "Velours", unit: "m" }, staff);
    const changed = await stock.updateItem(fresh.id, { unit: "m2" }, staff);
    expect(changed.unit).toBe("m2");
    await stock.recordMovement(fresh.id, { type: "entry", quantity: kg(1) }, staff);
    await expect(stock.updateItem(fresh.id, { unit: "m" }, staff)).rejects.toThrow(ConflictException);
  });

  it("archived items can no longer be moved or bought", async () => {
    const old = await stock.createItem({ name: "Ancien tissu", unit: "m", initial_quantity: kg(2) }, staff);
    await stock.setActive(old.id, false, admin);
    await expect(stock.recordMovement(old.id, { type: "entry", quantity: 1000 }, staff)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      expenses.create(
        { category: "materials", lines: [{ stock_item_id: old.id, quantity: 1000, unit_price: 1 }] },
        staff,
      ),
    ).rejects.toThrow(ConflictException);
    expect((await stock.listItems({})).data.some((i) => i.id === old.id)).toBe(false);
    expect((await stock.listItems({ includeArchived: true })).data.some((i) => i.id === old.id)).toBe(true);
  });

  it("summarizes the active stock (counts and value)", async () => {
    const { summary, data } = await stock.listItems({});
    expect(summary.total).toBe(data.length);
    expect(summary.out).toBe(data.filter((i) => i.quantity <= 0).length);
    expect(summary.value).toBeGreaterThan(0);
  });

  // New material with a starting quantity → automatic dépense
  it("creating a material with a quantity books a 'Matières & Fournitures' dépense atomically", async () => {
    const before = (await expenses.list({ category: "materials" })).meta.total;
    const { item, expense } = await expenses.createMaterial(
      { name: "Toile de jute", unit: "m", initial_quantity: kg(12), unit_price: 4_000, supplier: "Souk El Blat" },
      staff,
    );
    expect(item.quantity).toBe(kg(12));
    expect(expense?.amount).toBe(48_000);
    expect(expense?.category).toBe("materials");
    expect(expense?.note).toBe("Souk El Blat");
    expect(expense?.lines[0].stock_item_id).toBe(item.id);
    expect((await expenses.list({ category: "materials" })).meta.total).toBe(before + 1);
    const mv = await movementsOf(item.id);
    expect(mv.map((m) => [m.kind, m.expense_id])).toEqual([["purchase", expense!.id]]);
  });

  it("already-owned starting stock creates no dépense", async () => {
    const before = (await expenses.list({})).meta.total;
    const { item, expense } = await expenses.createMaterial(
      { name: "Fil doré", unit: "kg", initial_quantity: kg(2), already_owned: true },
      staff,
    );
    expect(expense).toBeNull();
    expect(item.quantity).toBe(kg(2));
    expect((await movementsOf(item.id))[0].kind).toBe("initial");
    expect((await expenses.list({})).meta.total).toBe(before);
  });

  it("a purchased starting quantity needs a price, and a failed purchase leaves no item behind", async () => {
    await expect(
      expenses.createMaterial({ name: "Perles", unit: "unit", initial_quantity: kg(50) }, staff),
    ).rejects.toThrow(BadRequestException);
    expect((await stock.listItems({ search: "perles", includeArchived: true })).data).toHaveLength(0);
    await expect(
      expenses.createMaterial({ name: "toile DE jute", unit: "m", initial_quantity: kg(1), unit_price: 1 }, staff),
    ).rejects.toThrow(ConflictException);
  });

  // 10 — existing permission rule holds for edits too
  it("keeps the owner-or-admin rule for editing expenses", async () => {
    const e = await expenses.create({ category: "rent", amount: 1_000 }, staff);
    await expect(
      expenses.update(e.id, { amount: 2_000 }, { id: "staff-2", full_name: "Autre", role: "staff" }),
    ).rejects.toThrow(ForbiddenException);
    expect((await expenses.update(e.id, { amount: 2_000 }, admin)).amount).toBe(2_000);
  });
});

describe("boot-time migration of an existing database", () => {
  it("adds the new expense columns and stock tables to a pre-stock database", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE expenses (
        id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL,
        note TEXT, date TEXT NOT NULL, recorded_by TEXT NOT NULL,
        recorded_by_label TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      INSERT INTO expenses VALUES ('old-1', 'rent', 1000, NULL, '2026-01-01', 'u', 'U', 1700000000000);
    `);
    ensureTables(sqlite);
    ensureTables(sqlite); // idempotent

    const cols = (sqlite.prepare("PRAGMA table_info(expenses)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["client_ref", "updated_at"]));
    const row = sqlite.prepare("SELECT updated_at FROM expenses WHERE id = 'old-1'").get() as { updated_at: number };
    expect(row.updated_at).toBe(1700000000000);

    const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (t) => t.name,
    );
    expect(tables).toEqual(expect.arrayContaining(["stock_items", "stock_movements", "expense_lines"]));
    sqlite.close();
  });
});
