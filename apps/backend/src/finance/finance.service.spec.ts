import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import { StockService } from "../stock/stock.service";
import { OrdersService } from "../orders/orders.service";
import { ExpensesService } from "../expenses/expenses.service";
import { FinanceService } from "./finance.service";

describe("FinanceService — KPIs & Cashflow aggregation", () => {
  let db: DbService;
  let audit: AuditService;
  let ordersService: OrdersService;
  let expensesService: ExpensesService;
  let financeService: FinanceService;

  const actor = {
    id: "admin-1",
    full_name: "Admin Boss",
    role: "super_admin" as const,
  };

  beforeAll(async () => {
    process.env.DB_PATH = ":memory:";
    db = new DbService();
    audit = new AuditService(db);
    ordersService = new OrdersService(db, audit);
    expensesService = new ExpensesService(db, audit, new StockService(db, audit));
    financeService = new FinanceService(db);

    // Create an order with total 100 DT (100000 millimes)
    const order = await ordersService.createOrder(
      {
        customer_name: "Client Test",
        customer_phone: "22000111",
        order_type: "local",
        items: [{ label: "Broderie", quantity: 2, unit_price: 50000 }],
      },
      actor,
    );

    // Add advance of 40 DT (40000 millimes)
    await ordersService.recordPayment(
      order.id,
      { amount: 40000, kind: "advance", note: "Acompte espèces" },
      actor,
    );

    // Record an expense of 15 DT (15000 millimes)
    await expensesService.create(
      {
        category: "materials",
        amount: 15000,
        note: "Papier",
        date: new Date().toISOString().split("T")[0],
      },
      actor,
    );
  });

  afterAll(() => {
    db.raw.close();
  });

  it("calculates today's and overall financial KPIs accurately", async () => {
    const stats = await financeService.getStats();

    expect(stats.today.revenue).toBe(40000);
    expect(stats.today.expenses).toBe(15000);
    expect(stats.today.net_profit).toBe(25000);

    expect(stats.overall.total_revenue).toBe(40000);
    expect(stats.overall.total_expenses).toBe(15000);
    expect(stats.overall.net_profit).toBe(25000);

    // Order total is 100000, paid 40000 -> outstanding 60000
    expect(stats.overall.outstanding_balances).toBe(60000);
    expect(stats.overall.advances_held).toBe(40000);
    expect(stats.overall.total_orders).toBe(1);

    expect(stats.trend).toHaveLength(14);
  });

  it("lists payment receipts with pagination", async () => {
    const res = await financeService.listPayments({});
    expect(res.meta.total).toBe(1);
    expect(res.totalAmount).toBe(40000);
    expect(res.data[0].amount).toBe(40000);
    expect(res.data[0].customer_name).toBe("Client Test");
  });
});
