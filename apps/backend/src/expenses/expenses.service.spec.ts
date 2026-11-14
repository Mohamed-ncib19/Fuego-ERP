import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import { ExpensesService } from "./expenses.service";
import { ForbiddenException } from "@nestjs/common";

describe("ExpensesService — accounting & deletion rules", () => {
  let db: DbService;
  let audit: AuditService;
  let service: ExpensesService;

  const adminActor = {
    id: "admin-1",
    full_name: "Admin Boss",
    role: "super_admin" as const,
  };

  const staffActor1 = {
    id: "staff-1",
    full_name: "Staff 1",
    role: "staff" as const,
  };

  const staffActor2 = {
    id: "staff-2",
    full_name: "Staff 2",
    role: "staff" as const,
  };

  beforeAll(() => {
    process.env.DB_PATH = ":memory:";
    db = new DbService();
    audit = new AuditService(db);
    service = new ExpensesService(db, audit);
  });

  afterAll(() => {
    db.raw.close();
  });

  it("creates an expense and saves integer millimes", async () => {
    const expense = await service.create(
      {
        category: "materials",
        amount: 25500, // 25.500 DT
        note: "Achat fil à coudre",
        date: "2026-11-14",
      },
      staffActor1,
    );

    expect(expense.id).toBeDefined();
    expect(expense.category).toBe("materials");
    expect(expense.amount).toBe(25500);
    expect(expense.note).toBe("Achat fil à coudre");
    expect(expense.date).toBe("2026-11-14");
    expect(expense.recorded_by).toBe("staff-1");
  });

  it("lists expenses and computes totalAmount", async () => {
    await service.create(
      {
        category: "utilities",
        amount: 50000,
        note: "Facture STEG",
        date: "2026-11-14",
      },
      staffActor1,
    );

    const res = await service.list({});
    expect(res.meta.total).toBe(2);
    expect(res.totalAmount).toBe(75500);
  });

  it("filters expenses by category", async () => {
    const res = await service.list({ category: "materials" });
    expect(res.meta.total).toBe(1);
    expect(res.data[0].category).toBe("materials");
    expect(res.totalAmount).toBe(25500);
  });

  it("enforces deletion permissions: staff cannot delete another user's expense", async () => {
    const exp = await service.create(
      {
        category: "rent",
        amount: 200000,
        date: "2026-11-14",
      },
      staffActor1,
    );

    await expect(service.delete(exp.id, staffActor2)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("allows super_admin to delete any expense", async () => {
    const exp = await service.create(
      {
        category: "equipment",
        amount: 12000,
        date: "2026-11-14",
      },
      staffActor2,
    );

    const res = await service.delete(exp.id, adminActor);
    expect(res.ok).toBe(true);

    const list = await service.list({ category: "equipment" });
    expect(list.meta.total).toBe(0);
  });
});
