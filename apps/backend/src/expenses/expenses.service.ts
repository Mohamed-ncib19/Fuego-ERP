import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import { StockService, type ExpenseLineInput, type ResolvedLine, type Tx } from "../stock/stock.service";
import { diffByItem, netByItem } from "../stock/stock.math";
import { expenseLines, expenses, stockItems, stockMovements } from "../db/schema";
import type { CreateExpenseDto, UpdateExpenseDto } from "./dto/expenses.dto";
import type { CreateStockItemDto } from "../stock/dto/stock.dto";
import {
  EXPENSE_CATEGORY_LABELS,
  STOCK_EXPENSE_CATEGORY,
  type Expense,
  type ExpenseCategory,
  type ExpenseLine,
  type PageMeta,
  type StockItem,
  type StockUnit,
} from "@fuego/shared";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

type ExpenseRow = typeof expenses.$inferSelect;

export interface MaterialUsage {
  movements: number;
  expenses: {
    id: string;
    date: string;
    note: string | null;
    amount: number;
    /** This material's share of the dépense, in millimes. */
    item_amount: number;
    has_other_lines: boolean;
  }[];
  expense_total: number;
}

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

        const booked = this.insertExpenseTx(
          tx,
          {
            category: dto.category,
            amount: dto.amount,
            note: dto.note,
            date,
            lines: lines as ExpenseLineInput[],
            clientRef,
          },
          actor,
          now,
        );
        return { ...booked, replay: false };
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

  /**
   * Writes one expense, its lines and the matching stock entries inside the
   * caller's transaction. Shared by `create` and `createMaterial` so both
   * book purchases identically.
   */
  private insertExpenseTx(
    tx: Tx,
    input: {
      category: ExpenseCategory;
      amount?: number;
      note?: string | null;
      date: string;
      lines: ExpenseLineInput[];
      clientRef: string | null;
    },
    actor: Actor,
    now: Date,
  ): { id: string; resolved: ResolvedLine[]; amount: number } {
    const resolved = this.stock.resolveExpenseLines(tx, input.lines, actor, now);
    const amount = resolved.length ? sumLines(resolved) : (input.amount ?? 0);
    if (amount < 1) throw new BadRequestException("Le montant total doit être supérieur à 0");
    const note = input.note?.trim() || null;

    const id = randomUUID();
    tx.insert(expenses)
      .values({
        id,
        category: input.category,
        amount,
        note,
        date: input.date,
        recorded_by: actor.id,
        recorded_by_label: actor.full_name,
        client_ref: input.clientRef,
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
        date: input.date,
        reason: note || "Achat — dépense",
        unitCosts: unitCosts(resolved),
      },
      actor,
      now,
    );
    return { id, resolved, amount };
  }

  /**
   * Creates a stock item. With a starting quantity it is a purchase: the item,
   * a "Matières & Fournitures" expense and the stock entry are written in one
   * transaction. `already_owned` books the quantity as initial stock instead,
   * with no expense, for stock the shop had before using Fuego.
   */
  async createMaterial(
    dto: CreateStockItemDto,
    actor: Actor,
  ): Promise<{ item: StockItem; expense: Expense | null }> {
    const qty = dto.initial_quantity ?? 0;
    if (qty <= 0 || dto.already_owned) {
      return { item: await this.stock.createItem(dto, actor), expense: null };
    }
    if (dto.unit_price === undefined || dto.unit_price < 1) {
      throw new BadRequestException("Indiquez le prix d'achat unitaire (ou cochez « Stock déjà en ma possession »)");
    }

    const date = dto.purchase_date || new Date().toISOString().split("T")[0];
    const now = new Date();
    const result = this.db.client.transaction(
      (tx) => {
        const itemId = this.stock.insertItemTx(tx, dto, actor, now);
        const booked = this.insertExpenseTx(
          tx,
          {
            category: STOCK_EXPENSE_CATEGORY,
            note: dto.supplier?.trim() || `Achat initial — ${dto.name.trim()}`,
            date,
            lines: [{ stock_item_id: itemId, quantity: qty, unit_price: dto.unit_price! }],
            clientRef: null,
          },
          actor,
          now,
        );
        return { itemId, ...booked };
      },
      { behavior: "immediate" },
    );

    const item = await this.stock.getItem(result.itemId);
    void this.audit.record({
      action: "stock_item.created",
      entityType: "stock_item",
      entityId: item.id,
      entityLabel: item.name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      newValues: { ...dto },
      meta: { expense_id: result.id },
    });
    void this.audit.record({
      action: "expense.created",
      entityType: "expense",
      entityId: result.id,
      entityLabel: `${STOCK_EXPENSE_CATEGORY} - ${result.amount} millimes`,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { category: STOCK_EXPENSE_CATEGORY, amount: result.amount, date, lines: result.resolved.map(auditLine) },
    });
    return { item, expense: await this.get(result.id) };
  }

  /**
   * What deleting a material touches: its stock history and the dépenses
   * that bought it (only this material's lines count toward `amount`).
   */
  async materialUsage(id: string): Promise<MaterialUsage> {
    await this.stock.getItem(id); // 404 if unknown
    return this.usageTx(this.db.client, id);
  }

  /**
   * Hard delete: the item and its whole stock history go, so its name can be
   * reused. Dépenses that bought it lose this material's lines; with
   * `deleteExpenses` their amount goes too (a dépense left with nothing is
   * deleted), otherwise the amount stays in the books as a plain expense.
   */
  async deleteMaterial(
    id: string,
    deleteExpenses: boolean,
    actor: Actor,
  ): Promise<{ ok: true; deleted_expenses: number; updated_expenses: number }> {
    const item = await this.stock.getItem(id);
    const now = new Date();

    const result = this.db.client.transaction(
      (tx) => {
        const usage = this.usageTx(tx, id);
        let deleted = 0;
        let updated = 0;
        for (const e of usage.expenses) {
          tx.delete(expenseLines)
            .where(and(eq(expenseLines.expense_id, e.id), eq(expenseLines.stock_item_id, id)))
            .run();
          // Nothing else in the dépense (no other line, no kept amount): it goes.
          if (deleteExpenses && !e.has_other_lines && e.amount <= e.item_amount) {
            tx.delete(expenses).where(eq(expenses.id, e.id)).run();
            deleted++;
            continue;
          }
          const row = tx.select().from(expenses).where(eq(expenses.id, e.id)).get()!;
          tx.update(expenses)
            .set(
              deleteExpenses
                ? { amount: row.amount - e.item_amount, updated_at: now }
                : // Keep what was bought readable once the line is gone.
                  { note: row.note ? `${row.note} (${item.name})` : `Achat — ${item.name}`, updated_at: now },
            )
            .where(eq(expenses.id, e.id))
            .run();
          updated++;
        }
        tx.delete(stockMovements).where(eq(stockMovements.stock_item_id, id)).run();
        tx.delete(stockItems).where(eq(stockItems.id, id)).run();
        return { deleted, updated, usage };
      },
      { behavior: "immediate" },
    );

    void this.audit.record({
      action: "stock_item.deleted",
      entityType: "stock_item",
      entityId: id,
      entityLabel: item.name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      prevValues: { ...item },
      meta: {
        delete_expenses: deleteExpenses,
        movements: result.usage.movements,
        expenses: result.usage.expenses,
      },
    });
    return { ok: true, deleted_expenses: result.deleted, updated_expenses: result.updated };
  }

  private usageTx(q: Tx | DbService["client"], id: string): MaterialUsage {
    const movements = q
      .select({ n: sql<number>`count(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.stock_item_id, id))
      .get()!.n;
    const rows = q
      .select({
        id: expenses.id,
        date: expenses.date,
        note: expenses.note,
        amount: expenses.amount,
        item_amount: sql<number>`sum(${expenseLines.line_total})`,
      })
      .from(expenseLines)
      .innerJoin(expenses, eq(expenses.id, expenseLines.expense_id))
      .where(eq(expenseLines.stock_item_id, id))
      .groupBy(expenses.id)
      .orderBy(asc(expenses.date))
      .all();
    const list = rows.map((r) => ({
      ...r,
      has_other_lines: Boolean(
        q
          .select({ n: sql<number>`count(*)` })
          .from(expenseLines)
          .where(and(eq(expenseLines.expense_id, r.id), ne(expenseLines.stock_item_id, id)))
          .get()!.n,
      ),
    }));
    return {
      movements,
      expenses: list,
      expense_total: list.reduce((t, e) => t + e.item_amount, 0),
    };
  }

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
