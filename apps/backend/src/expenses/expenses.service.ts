import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import { StockService, type ExpenseLineInput, type ResolvedLine, type Tx } from "../stock/stock.service";
import { diffByItem, netByItem } from "../stock/stock.math";
import { expenseLines, expenses, stockItems } from "../db/schema";
import type { CreateExpenseDto, UpdateExpenseDto } from "./dto/expenses.dto";
import {
  EXPENSE_CATEGORY_LABELS,
  STOCK_EXPENSE_CATEGORY,
  type Expense,
  type ExpenseCategory,
  type ExpenseLine,
  type PageMeta,
  type StockUnit,
} from "@fuego/shared";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

type ExpenseRow = typeof expenses.$inferSelect;

/**
 * Expenses (dépenses). A "materials" expense may carry purchased-material
 * lines: the expense, its lines and the matching stock movements are always
 * written in ONE transaction, so the books and the stock never disagree.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  async create(dto: CreateExpenseDto, actor: Actor): Promise<Expense> {
    const clientRef = dto.client_ref?.trim() || null;
    const lines = dto.lines ?? [];
    this.assertLinesAllowed(dto.category, lines);

    const date = dto.date || new Date().toISOString().split("T")[0];
    const now = new Date();

    const result = this.db.client.transaction(
      (tx) => {
        // Replayed submit (double click, retry after a lost response): hand
        // back the expense already booked — no second expense, no second stock entry.
        if (clientRef) {
          const prior = tx
            .select({ id: expenses.id })
            .from(expenses)
            .where(eq(expenses.client_ref, clientRef))
            .get();
          if (prior) return { id: prior.id, replay: true, resolved: [] as ResolvedLine[], amount: 0 };
        }

        const resolved = this.stock.resolveExpenseLines(tx, lines as ExpenseLineInput[], actor, now);
        const amount = resolved.length ? sumLines(resolved) : (dto.amount ?? 0);
        if (amount < 1) throw new BadRequestException("Le montant total doit être supérieur à 0");

        const id = randomUUID();
        tx.insert(expenses)
          .values({
            id,
            category: dto.category,
            amount,
            note: dto.note?.trim() || null,
            date,
            recorded_by: actor.id,
            recorded_by_label: actor.full_name,
            client_ref: clientRef,
            created_at: now,
            updated_at: now,
          })
          .run();

        this.insertLines(tx, id, resolved);
        this.stock.bookExpenseDeltas(
          tx,
          netByItem(resolved),
          {
            expenseId: id,
            kind: "purchase",
            date,
            reason: dto.note?.trim() || "Achat — dépense",
            unitCosts: unitCosts(resolved),
          },
          actor,
          now,
        );
        return { id, replay: false, resolved, amount };
      },
      { behavior: "immediate" },
    );

    if (!result.replay) {
      void this.audit.record({
        action: "expense.created",
        entityType: "expense",
        entityId: result.id,
        entityLabel: `${dto.category} - ${result.amount} millimes`,
        actorId: actor.id,
        actorLabel: actor.full_name,
        actorRole: actor.role,
        meta: {
          category: dto.category,
          amount: result.amount,
          date,
          lines: result.resolved.map(auditLine),
        },
      });
    }

    return this.get(result.id);
  }

  async update(id: string, dto: UpdateExpenseDto, actor: Actor): Promise<Expense> {
    const before = await this.get(id);
    this.assertCanChange(before, actor, "modifier");

    const now = new Date();

    this.db.client.transaction(
      (tx) => {
        // Re-read inside the write lock: the diff must be against what is
        // stored now, not what was read before another request slipped in.
        const current = this.readTx(tx, id);
        const category = dto.category ?? current.category;
        // New lines: as sent, or the current ones kept — unless the expense
        // leaves the materials category, which takes its stock with it.
        let inputs: ExpenseLineInput[];
        if (dto.lines !== undefined) {
          this.assertLinesAllowed(category, dto.lines);
          inputs = dto.lines as ExpenseLineInput[];
        } else if (category !== STOCK_EXPENSE_CATEGORY) {
          inputs = [];
        } else {
          inputs = current.lines.map((l) => ({
            stock_item_id: l.stock_item_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
          }));
        }

        const resolved = this.stock.resolveExpenseLines(tx, inputs, actor, now);
        const amount = resolved.length ? sumLines(resolved) : (dto.amount ?? current.amount);
        if (amount < 1) throw new BadRequestException("Le montant total doit être supérieur à 0");
        const date = dto.date || current.date;

        tx.update(expenses)
          .set({
            category,
            amount,
            note: dto.note !== undefined ? dto.note.trim() || null : current.note,
            date,
            updated_at: now,
          })
          .where(eq(expenses.id, id))
          .run();

        tx.delete(expenseLines).where(eq(expenseLines.expense_id, id)).run();
        this.insertLines(tx, id, resolved);

        // Only the difference moves the stock: an unchanged line books nothing.
        this.stock.bookExpenseDeltas(
          tx,
          diffByItem(netByItem(current.lines), netByItem(resolved)),
          {
            expenseId: id,
            kind: "purchase_correction",
            date,
            reason: `Modification de la dépense du ${frDate(current.date)}`,
            unitCosts: unitCosts(resolved),
          },
          actor,
          now,
        );
      },
      { behavior: "immediate" },
    );

    const after = await this.get(id);
    void this.audit.record({
      action: "expense.updated",
      entityType: "expense",
      entityId: id,
      entityLabel: `${after.category} - ${after.amount} millimes`,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      prevValues: auditExpense(before),
      newValues: auditExpense(after),
    });
    return after;
  }

  async get(id: string): Promise<Expense> {
    const row = this.db.client.select().from(expenses).where(eq(expenses.id, id)).get();
    if (!row) {
      throw new NotFoundException("Dépense introuvable");
    }
    return toExpense(row, this.linesFor([id]).get(id) ?? []);
  }

  async list(params: {
    from?: string;
    to?: string;
    category?: string;
    limit?: number;
    page?: number;
  }): Promise<{ data: Expense[]; meta: PageMeta; totalAmount: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 25), 200);

    const conditions = [];

    if (params.category) {
      conditions.push(eq(expenses.category, params.category));
    }

    if (params.from) {
      conditions.push(sql`${expenses.date} >= ${params.from}`);
    }

    if (params.to) {
      conditions.push(sql`${expenses.date} <= ${params.to}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countRow = this.db.client
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(where)
      .get() as { count: number; totalAmount: number } | undefined;

    const total = countRow?.count ?? 0;
    const totalAmount = countRow?.totalAmount ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const rows = this.db.client
      .select()
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.date), desc(expenses.created_at))
      .offset((page - 1) * limit)
      .limit(limit)
      .all();

    const lines = this.linesFor(rows.map((r) => r.id));

    return {
      data: rows.map((r) => toExpense(r, lines.get(r.id) ?? [])),
      totalAmount,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async delete(id: string, actor: Actor): Promise<{ ok: boolean }> {
    const existing = await this.get(id);
    this.assertCanChange(existing, actor, "supprimer");
    const now = new Date();

    this.db.client.transaction(
      (tx) => {
        // Reverse the stock first (refused if the material was already used),
        // then drop the expense — its lines cascade, and the ledger rows keep
        // their history with expense_id cleared.
        const current = this.readTx(tx, id);
        this.stock.bookExpenseDeltas(
          tx,
          diffByItem(netByItem(current.lines), new Map()),
          {
            expenseId: id,
            kind: "purchase_reversal",
            date: new Date().toISOString().split("T")[0],
            reason: `Suppression de la dépense du ${frDate(existing.date)} (${(existing.amount / 1000).toFixed(3)} DT)`,
          },
          actor,
          now,
        );
        tx.delete(expenses).where(eq(expenses.id, id)).run();
      },
      { behavior: "immediate" },
    );

    void this.audit.record({
      action: "expense.deleted",
      entityType: "expense",
      entityId: id,
      entityLabel: `${existing.category} - ${existing.amount} millimes`,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { existing: auditExpense(existing) },
    });

    return { ok: true };
  }

  // -------------------------------------------------------------------------

  /** The stored expense, read through the transaction handle. */
  private readTx(tx: Tx, id: string): Expense {
    const row = tx.select().from(expenses).where(eq(expenses.id, id)).get();
    if (!row) throw new NotFoundException("Dépense introuvable");
    return toExpense(row, this.linesFor([id], tx).get(id) ?? []);
  }

  private assertCanChange(expense: Expense, actor: Actor, verb: string) {
    if (actor.role !== "super_admin" && expense.recorded_by !== actor.id) {
      throw new ForbiddenException(`Seul un administrateur peut ${verb} cette dépense`);
    }
  }

  private assertLinesAllowed(category: ExpenseCategory, lines: unknown[]) {
    if (lines.length > 0 && category !== STOCK_EXPENSE_CATEGORY) {
      throw new BadRequestException(
        `Seules les dépenses « ${EXPENSE_CATEGORY_LABELS[STOCK_EXPENSE_CATEGORY]} » peuvent alimenter le stock`,
      );
    }
  }

  private insertLines(tx: Tx, expenseId: string, lines: ResolvedLine[]) {
    lines.forEach((l, position) => {
      tx.insert(expenseLines)
        .values({
          id: randomUUID(),
          expense_id: expenseId,
          position,
          stock_item_id: l.stock_item_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.line_total,
        })
        .run();
    });
  }

  /** Lines of several expenses in one query, grouped by expense. */
  private linesFor(expenseIds: string[], q: Tx | DbService["client"] = this.db.client): Map<string, ExpenseLine[]> {
    const out = new Map<string, ExpenseLine[]>();
    if (expenseIds.length === 0) return out;
    const rows = q
      .select({
        id: expenseLines.id,
        expense_id: expenseLines.expense_id,
        position: expenseLines.position,
        stock_item_id: expenseLines.stock_item_id,
        quantity: expenseLines.quantity,
        unit_price: expenseLines.unit_price,
        line_total: expenseLines.line_total,
        item_name: stockItems.name,
        item_unit: stockItems.unit,
      })
      .from(expenseLines)
      .innerJoin(stockItems, eq(stockItems.id, expenseLines.stock_item_id))
      .where(inArray(expenseLines.expense_id, expenseIds))
      .orderBy(asc(expenseLines.position))
      .all();
    for (const r of rows) {
      const list = out.get(r.expense_id) ?? [];
      list.push({ ...r, item_unit: r.item_unit as StockUnit });
      out.set(r.expense_id, list);
    }
    return out;
  }
}

function toExpense(row: ExpenseRow, lines: ExpenseLine[]): Expense {
  return {
    id: row.id,
    category: row.category as ExpenseCategory,
    amount: row.amount,
    note: row.note,
    date: row.date,
    recorded_by: row.recorded_by,
    recorded_by_label: row.recorded_by_label,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at ?? row.created_at).toISOString(),
    lines,
  };
}

function sumLines(lines: ResolvedLine[]): number {
  return lines.reduce((s, l) => s + l.line_total, 0);
}

function unitCosts(lines: ResolvedLine[]): Map<string, number> {
  return new Map(lines.map((l) => [l.stock_item_id, l.unit_price]));
}

function auditLine(l: { item_name: string; quantity: number; unit_price: number; line_total: number }) {
  return { item: l.item_name, quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total };
}

function auditExpense(e: Expense) {
  return {
    category: e.category,
    amount: e.amount,
    note: e.note,
    date: e.date,
    lines: e.lines.map(auditLine),
  };
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
