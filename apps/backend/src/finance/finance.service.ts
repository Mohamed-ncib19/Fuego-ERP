import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { orders, payments, expenses } from "../db/schema";
import type { FinanceStats, OrderStatus, PageMeta, PaymentKind } from "@fuego/shared";

@Injectable()
export class FinanceService {
  constructor(private readonly db: DbService) {}

  async getStats(): Promise<FinanceStats> {
    const today = new Date().toISOString().split("T")[0];
    const todayStartMs = new Date(today).getTime();
    const todayEndMs = todayStartMs + 86400000 - 1;

    // Today's payments revenue (advance + balance - refund)
    const todayPaymentsRow = this.db.client
      .select({
        revenue: sql<number>`coalesce(sum(CASE WHEN ${payments.kind} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)`,
      })
      .from(payments)
      .where(
        and(
          sql`${payments.created_at} >= ${todayStartMs}`,
          sql`${payments.created_at} <= ${todayEndMs}`,
        ),
      )
      .get() as { revenue: number } | undefined;

    // Today's expenses
    const todayExpensesRow = this.db.client
      .select({
        expenses: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(eq(expenses.date, today))
      .get() as { expenses: number } | undefined;

    // Today's orders created
    const todayOrdersCountRow = this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          sql`${orders.created_at} >= ${todayStartMs}`,
          sql`${orders.created_at} <= ${todayEndMs}`,
        ),
      )
      .get() as { count: number } | undefined;

    // Today's orders delivered
    const todayDeliveredCountRow = this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.status, "delivered"),
          sql`${orders.updated_at} >= ${todayStartMs}`,
        ),
      )
      .get() as { count: number } | undefined;

    // Overall Revenue
    const overallRevenueRow = this.db.client
      .select({
        revenue: sql<number>`coalesce(sum(CASE WHEN ${payments.kind} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)`,
      })
      .from(payments)
      .get() as { revenue: number } | undefined;

    // Overall Expenses
    const overallExpensesRow = this.db.client
      .select({
        expenses: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .get() as { expenses: number } | undefined;

    // Overall Total Orders
    const totalOrdersRow = this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .get() as { count: number } | undefined;

    // Outstanding Balances & Advances Held on active orders
    const activeOrdersRows = this.db.client
      .select({
        id: orders.id,
        total_amount: orders.total_amount,
        delivery_fee: orders.delivery_fee,
        status: orders.status,
        paid: sql<number>`coalesce((SELECT sum(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) FROM payments WHERE payments.order_id = orders.id), 0)`,
        advances: sql<number>`coalesce((SELECT sum(amount) FROM payments WHERE payments.order_id = orders.id AND kind = 'advance'), 0)`,
      })
      .from(orders)
      .where(sql`${orders.status} NOT IN ('delivered', 'cancelled')`)
      .all();

    let outstandingBalances = 0;
    let advancesHeld = 0;
    for (const ord of activeOrdersRows) {
      const grand = ord.total_amount + ord.delivery_fee;
      const reste = grand - (Number(ord.paid) || 0);
      if (reste > 0) outstandingBalances += reste;
      advancesHeld += Number(ord.advances) || 0;
    }

    // Status breakdown
    const statusCounts = this.db.client
      .select({
        status: orders.status,
        count: sql<number>`count(*)`,
      })
      .from(orders)
      .groupBy(orders.status)
      .all();

    const breakdown: Record<OrderStatus, number> = {
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const sc of statusCounts) {
      if (sc.status in breakdown) {
        breakdown[sc.status as OrderStatus] = Number(sc.count) || 0;
      }
    }

    // 14-day trend: daily revenue and expenses
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]);
    }

    const trend = days.map((dayStr) => {
      const startMs = new Date(dayStr).getTime();
      const endMs = startMs + 86400000 - 1;

      const dayPayments = this.db.client
        .select({
          revenue: sql<number>`coalesce(sum(CASE WHEN ${payments.kind} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)`,
        })
        .from(payments)
        .where(
          and(
            sql`${payments.created_at} >= ${startMs}`,
            sql`${payments.created_at} <= ${endMs}`,
          ),
        )
        .get() as { revenue: number } | undefined;

      const dayExpenses = this.db.client
        .select({
          expenses: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
        })
        .from(expenses)
        .where(eq(expenses.date, dayStr))
        .get() as { expenses: number } | undefined;

      return {
        date: dayStr,
        revenue: Number(dayPayments?.revenue) || 0,
        expenses: Number(dayExpenses?.expenses) || 0,
      };
    });

    const revToday = Number(todayPaymentsRow?.revenue) || 0;
    const expToday = Number(todayExpensesRow?.expenses) || 0;
    const revTotal = Number(overallRevenueRow?.revenue) || 0;
    const expTotal = Number(overallExpensesRow?.expenses) || 0;

    return {
      today: {
        revenue: revToday,
        expenses: expToday,
        net_profit: revToday - expToday,
        orders_count: Number(todayOrdersCountRow?.count) || 0,
        delivered_count: Number(todayDeliveredCountRow?.count) || 0,
      },
      overall: {
        total_revenue: revTotal,
        total_expenses: expTotal,
        net_profit: revTotal - expTotal,
        outstanding_balances: outstandingBalances,
        advances_held: advancesHeld,
        total_orders: Number(totalOrdersRow?.count) || 0,
      },
      status_breakdown: breakdown,
      trend,
    };
  }

  async listPayments(params: {
    from?: string;
    to?: string;
    kind?: string;
    limit?: number;
    page?: number;
  }): Promise<{ data: any[]; meta: PageMeta; totalAmount: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 25), 200);

    const conditions = [];

    if (params.kind) {
      conditions.push(eq(payments.kind, params.kind));
    }

    if (params.from) {
      const fromMs = new Date(params.from).getTime();
      if (!Number.isNaN(fromMs)) {
        conditions.push(sql`${payments.created_at} >= ${fromMs}`);
      }
    }

    if (params.to) {
      const toMs = new Date(params.to).getTime() + 86400000 - 1;
      if (!Number.isNaN(toMs)) {
        conditions.push(sql`${payments.created_at} <= ${toMs}`);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countRow = this.db.client
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`coalesce(sum(CASE WHEN ${payments.kind} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)`,
      })
      .from(payments)
      .where(where)
      .get() as { count: number; totalAmount: number } | undefined;

    const total = countRow?.count ?? 0;
    const totalAmount = countRow?.totalAmount ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const rows = this.db.client
      .select({
        id: payments.id,
        order_id: payments.order_id,
        ticket_no: orders.ticket_no,
        customer_name: orders.customer_name,
        kind: payments.kind,
        amount: payments.amount,
        note: payments.note,
        recorded_by: payments.recorded_by,
        recorded_by_label: payments.recorded_by_label,
        created_at: payments.created_at,
      })
      .from(payments)
      .leftJoin(orders, eq(orders.id, payments.order_id))
      .where(where)
      .orderBy(desc(payments.created_at))
      .offset((page - 1) * limit)
      .limit(limit)
      .all();

    return {
      data: rows.map((r) => ({
        id: r.id,
        order_id: r.order_id,
        ticket_no: r.ticket_no,
        customer_name: r.customer_name,
        kind: r.kind as PaymentKind,
        amount: r.amount,
        note: r.note,
        recorded_by: r.recorded_by,
        recorded_by_label: r.recorded_by_label,
        created_at: new Date(r.created_at).toISOString(),
      })),
      totalAmount,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}
