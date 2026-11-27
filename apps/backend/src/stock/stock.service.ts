import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, asc, eq, getTableColumns, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  MATERIAL_KINDS,
  STOCK_UNIT_LABELS,
  stockLevel,
  type PageMeta,
  type StockItem,
  type StockItemKind,
  type StockLevel,
  type StockMovement,
  type StockMovementKind,
  type StockSummary,
  type StockUnit,
} from "@fuego/shared";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import * as schema from "../db/schema";
import { expenseLines, expenses, stockItems, stockMovements } from "../db/schema";
import { cleanName, formatQty, lineTotal, nameKey, today } from "./stock.math";
import type {
  CreateStockItemDto,
  NewStockItemDto,
  RecordMovementDto,
  UpdateStockItemDto,
} from "./dto/stock.dto";

export interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

type Client = BetterSQLite3Database<typeof schema>;
/** The drizzle handle inside `client.transaction(cb)` — same sync API. */
export type Tx = Parameters<Parameters<Client["transaction"]>[0]>[0];
type Q = Client | Tx;

/** A purchased-material line as the expense form sends it. */
export interface ExpenseLineInput {
  stock_item_id?: string;
  new_item?: NewStockItemDto;
  quantity: number;
  unit_price: number;
}

/** A line once its stock item is known (created if it was new). */
export interface ResolvedLine {
  stock_item_id: string;
  item_name: string;
  item_unit: StockUnit;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/** What an expense booking adds to the stock ledger. */
export interface ExpenseBooking {
  expenseId: string;
  kind: Extract<StockMovementKind, "purchase" | "purchase_correction" | "purchase_reversal">;
  date: string;
  reason: string;
  /** Unit price per item for the rows that add stock. */
  unitCosts?: Map<string, number>;
}

@Injectable()
export class StockService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Item rows with the quantity derived from the ledger. */
  private selectItems(q: Q, where?: SQL) {
    return q
      .select({
        ...getTableColumns(stockItems),
        quantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
        movements_count: sql<number>`count(${stockMovements.id})`,
        last_movement_at: sql<number | null>`max(${stockMovements.created_at})`,
        // Latest purchase price comes from the expense lines — the record of
        // what was paid — so editing a price is reflected immediately.
        last_unit_cost: sql<number | null>`(
          select el.unit_price from ${expenseLines} el
          join ${expenses} e on e.id = el.expense_id
          where el.stock_item_id = ${stockItems.id}
          order by e.date desc, e.created_at desc
          limit 1
        )`,
      })
      .from(stockItems)
      .leftJoin(stockMovements, eq(stockMovements.stock_item_id, stockItems.id))
      .where(where)
      .groupBy(stockItems.id)
      .orderBy(asc(stockItems.name_key))
      .all()
      .map((r): StockItem => {
        const quantity = Number(r.quantity);
        return {
          id: r.id,
          name: r.name,
          kind: r.kind as StockItemKind,
          category: r.category,
          unit: r.unit as StockUnit,
          min_threshold: r.min_threshold,
          note: r.note,
          is_active: Boolean(r.is_active),
          created_at: new Date(r.created_at).toISOString(),
          updated_at: new Date(r.updated_at).toISOString(),
          quantity,
          level: stockLevel(quantity, r.min_threshold),
          movements_count: Number(r.movements_count),
          last_movement_at: r.last_movement_at ? new Date(Number(r.last_movement_at)).toISOString() : null,
          last_unit_cost: r.last_unit_cost === null ? null : Number(r.last_unit_cost),
        };
      });
  }

  async listItems(params: {
    search?: string;
    kind?: StockItemKind;
    /** "materials" = raw materials + supplies (the Matières premières page). */
    scope?: "all" | "materials";
    level?: StockLevel;
    includeArchived?: boolean;
  }): Promise<{ data: StockItem[]; summary: StockSummary }> {
    const scopeConds: SQL[] = [];
    if (params.scope === "materials") scopeConds.push(inArray(stockItems.kind, MATERIAL_KINDS));
    if (params.kind) scopeConds.push(eq(stockItems.kind, params.kind));

    const all = this.selectItems(this.db.client, scopeConds.length ? and(...scopeConds) : undefined);

    // Tiles describe the whole active scope, not the current search.
    const active = all.filter((i) => i.is_active);
    const summary: StockSummary = {
      total: active.length,
      low: active.filter((i) => i.level === "low").length,
      out: active.filter((i) => i.level === "out").length,
      value: active.reduce(
        (sum, i) => sum + (i.last_unit_cost && i.quantity > 0 ? lineTotal(i.quantity, i.last_unit_cost) : 0),
        0,
      ),
    };

    const key = params.search ? nameKey(params.search) : "";
    const data = all.filter((i) => {
      if (!params.includeArchived && !i.is_active) return false;
      if (params.level && i.level !== params.level) return false;
      if (key && !nameKey(i.name).includes(key) && !nameKey(i.category ?? "").includes(key)) return false;
      return true;
    });
    return { data, summary };
  }

  async getItem(id: string): Promise<StockItem> {
    return this.getItemTx(this.db.client, id);
  }

  private getItemTx(q: Q, id: string): StockItem {
    const [item] = this.selectItems(q, eq(stockItems.id, id));
    if (!item) throw new NotFoundException("Article de stock introuvable");
    return item;
  }

  /** Distinct categories already used — suggestions for the forms. */
  async categories(): Promise<string[]> {
    const rows = this.db.client
      .selectDistinct({ category: stockItems.category })
      .from(stockItems)
      .where(sql`${stockItems.category} is not null and ${stockItems.category} <> ''`)
      .orderBy(asc(stockItems.category))
      .all();
    return rows.map((r) => r.category!).filter(Boolean);
  }

  /** Current quantity of one item, read inside the caller's transaction. */
  quantityOf(q: Q, itemId: string): number {
    const row = q
      .select({ qty: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(eq(stockMovements.stock_item_id, itemId))
      .get();
    return Number(row?.qty ?? 0);
  }

  async listMovements(params: {
    itemId?: string;
    kind?: StockMovementKind;
    from?: string;
    to?: string;
    expenseId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: StockMovement[]; meta: PageMeta }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 25), 200);

    const where: string[] = [];
    const args: unknown[] = [];
    if (params.itemId) (where.push("m.stock_item_id = ?"), args.push(params.itemId));
    if (params.kind) (where.push("m.kind = ?"), args.push(params.kind));
    if (params.from) (where.push("m.date >= ?"), args.push(params.from));
    if (params.to) (where.push("m.date <= ?"), args.push(params.to));
    if (params.expenseId) (where.push("m.expense_id = ?"), args.push(params.expenseId));
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // The running balance is computed over the item's full history before
    // filtering, so a filtered page still shows true "stock after" values.
    const base = `
      WITH m AS (
        SELECT sm.*, sm.rowid AS rid,
          SUM(sm.quantity) OVER (
            PARTITION BY sm.stock_item_id ORDER BY sm.created_at, sm.rowid
            ROWS UNBOUNDED PRECEDING
          ) AS balance_after
        FROM stock_movements sm
      )`;

    const raw = this.db.raw;
    const { total } = raw
      .prepare(`${base} SELECT count(*) AS total FROM m ${whereSql}`)
      .get(...args) as { total: number };

    const rows = raw
      .prepare(
        `${base}
         SELECT m.*, i.name AS item_name, i.unit AS item_unit
         FROM m JOIN stock_items i ON i.id = m.stock_item_id
         ${whereSql}
         ORDER BY m.created_at DESC, m.rid DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...args, limit, (page - 1) * limit) as Array<Record<string, any>>;

    return {
      data: rows.map((r) => ({
        id: r.id,
        stock_item_id: r.stock_item_id,
        item_name: r.item_name,
        item_unit: r.item_unit,
        kind: r.kind,
        quantity: r.quantity,
        unit_cost: r.unit_cost,
        reason: r.reason,
        date: r.date,
        expense_id: r.expense_id,
        recorded_by: r.recorded_by,
        recorded_by_label: r.recorded_by_label,
        created_at: new Date(r.created_at).toISOString(),
        balance_after: r.balance_after,
      })),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  // -------------------------------------------------------------------------
  // Item writes
  // -------------------------------------------------------------------------

  async createItem(dto: CreateStockItemDto, actor: Actor): Promise<StockItem> {
    const now = new Date();
    const id = this.db.client.transaction(
      (tx) => {
        const itemId = this.insertItemTx(tx, dto, actor, now);
        const initial = dto.initial_quantity ?? 0;
        if (initial > 0) {
          this.insertMovement(tx, {
            itemId,
            kind: "initial",
            quantity: initial,
            date: today(),
            actor,
            now,
          });
        }
        return itemId;
      },
      { behavior: "immediate" },
    );

    const item = await this.getItem(id);
    void this.audit.record({
      action: "stock_item.created",
      entityType: "stock_item",
      entityId: id,
      entityLabel: item.name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      newValues: { ...dto },
    });
    return item;
  }

  /** Inserts the item row only; refuses a name already taken (any casing/accents). */
  insertItemTx(
    tx: Tx,
    input: {
      name: string;
      unit: StockUnit;
      kind?: StockItemKind;
      category?: string;
      min_threshold?: number;
      note?: string;
    },
    actor: Actor,
    now: Date,
  ): string {
    const name = cleanName(input.name);
    if (!name) throw new BadRequestException("Le nom est obligatoire");
    const key = nameKey(name);
    this.assertNameFree(tx, key, name);

    const id = randomUUID();
    tx.insert(stockItems)
      .values({
        id,
        name,
        name_key: key,
        kind: input.kind ?? "raw_material",
        category: input.category?.trim() || null,
        unit: input.unit,
        min_threshold: input.min_threshold ?? 0,
        note: input.note?.trim() || null,
        is_active: true,
        created_by: actor.id,
        created_at: now,
        updated_at: now,
      })
      .run();
    return id;
  }

  private assertNameFree(q: Q, key: string, name: string, exceptId?: string) {
    const clash = q
      .select({ id: stockItems.id, name: stockItems.name })
      .from(stockItems)
      .where(exceptId ? and(eq(stockItems.name_key, key), ne(stockItems.id, exceptId)) : eq(stockItems.name_key, key))
      .get();
    if (clash) throw new ConflictException(`Un article nommé « ${clash.name} » existe déjà`);
  }

  async updateItem(id: string, dto: UpdateStockItemDto, actor: Actor): Promise<StockItem> {
    const before = await this.getItem(id);

    this.db.client.transaction(
      (tx) => {
        const patch: Partial<typeof stockItems.$inferInsert> = { updated_at: new Date() };
        if (dto.name !== undefined) {
          const name = cleanName(dto.name);
          if (!name) throw new BadRequestException("Le nom est obligatoire");
          this.assertNameFree(tx, nameKey(name), name, id);
          patch.name = name;
          patch.name_key = nameKey(name);
        }
        if (dto.unit !== undefined && dto.unit !== before.unit) {
          // Stored quantities are in the old unit — changing it would silently
          // rescale the whole history.
          if (this.quantityOfHistory(tx, id) > 0) {
            throw new ConflictException(
              "L'unité ne peut plus être modifiée : cet article a déjà des mouvements de stock",
            );
          }
          patch.unit = dto.unit;
        }
        if (dto.kind !== undefined) patch.kind = dto.kind;
        if (dto.category !== undefined) patch.category = dto.category.trim() || null;
        if (dto.min_threshold !== undefined) patch.min_threshold = dto.min_threshold;
        if (dto.note !== undefined) patch.note = dto.note.trim() || null;
        tx.update(stockItems).set(patch).where(eq(stockItems.id, id)).run();
      },
      { behavior: "immediate" },
    );

    const after = await this.getItem(id);
    void this.audit.record({
      action: "stock_item.updated",
      entityType: "stock_item",
      entityId: id,
      entityLabel: after.name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      prevValues: pick(before),
      newValues: pick(after),
    });
    return after;
  }

  /** Number of ledger rows (any sign) — 0 means the item was never moved. */
  private quantityOfHistory(q: Q, id: string): number {
    const row = q
      .select({ n: sql<number>`count(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.stock_item_id, id))
      .get();
    return Number(row?.n ?? 0);
  }

  /** Archive / restore. Archived items keep their history but cannot be moved or bought. */
  async setActive(id: string, isActive: boolean, actor: Actor): Promise<StockItem> {
    const before = await this.getItem(id);
    this.db.client
      .update(stockItems)
      .set({ is_active: isActive, updated_at: new Date() })
      .where(eq(stockItems.id, id))
      .run();
    void this.audit.record({
      action: isActive ? "stock_item.restored" : "stock_item.archived",
      entityType: "stock_item",
      entityId: id,
      entityLabel: before.name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { quantity: before.quantity },
    });
    return this.getItem(id);
  }

  // -------------------------------------------------------------------------
  // Movements
  // -------------------------------------------------------------------------

  /** Manual entry / exit / inventory count from the stock screen. */
  async recordMovement(id: string, dto: RecordMovementDto, actor: Actor): Promise<StockMovement> {
    if (dto.type === "count" && actor.role !== "super_admin") {
      throw new ForbiddenException("Seul un administrateur peut corriger le stock par inventaire");
    }
    const now = new Date();

    const movementId = this.db.client.transaction(
      (tx) => {
        const item = this.getItemTx(tx, id);
        if (!item.is_active) throw new ConflictException("Cet article est archivé — réactivez-le d'abord");
        const current = this.quantityOf(tx, id);
        const unit = STOCK_UNIT_LABELS[item.unit];

        let delta: number;
        let kind: StockMovementKind;
        if (dto.type === "entry") {
          if (dto.quantity < 1) throw new BadRequestException("La quantité doit être supérieure à 0");
          delta = dto.quantity;
          kind = "entry";
        } else if (dto.type === "exit") {
          if (dto.quantity < 1) throw new BadRequestException("La quantité doit être supérieure à 0");
          if (dto.quantity > current) {
            throw new ConflictException(
              `Stock insuffisant pour « ${item.name} » : ${formatQty(current, unit)} disponible(s)`,
            );
          }
          delta = -dto.quantity;
          kind = "exit";
        } else {
          delta = dto.quantity - current;
          if (delta === 0) {
            throw new BadRequestException("La quantité comptée est identique au stock actuel");
          }
          kind = "adjustment";
        }

        return this.insertMovement(tx, {
          itemId: id,
          kind,
          quantity: delta,
          reason: dto.reason?.trim() || null,
          date: dto.date || today(),
          actor,
          now,
        });
      },
      { behavior: "immediate" },
    );

    const res = await this.listMovements({ itemId: id, limit: 1 });
    const movement = res.data.find((m) => m.id === movementId) ?? res.data[0];
    void this.audit.record({
      action: `stock.${movement.kind}`,
      entityType: "stock_item",
      entityId: id,
      entityLabel: movement.item_name,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { quantity: movement.quantity, reason: movement.reason, date: movement.date },
    });
    return movement;
  }

  insertMovement(
    tx: Tx,
    m: {
      itemId: string;
      kind: StockMovementKind;
      quantity: number;
      unitCost?: number | null;
      reason?: string | null;
      date: string;
      expenseId?: string | null;
      actor: Actor;
      now: Date;
    },
  ): string {
    const id = randomUUID();
    tx.insert(stockMovements)
      .values({
        id,
        stock_item_id: m.itemId,
        kind: m.kind,
        quantity: m.quantity,
        unit_cost: m.unitCost ?? null,
        reason: m.reason ?? null,
        date: m.date,
        expense_id: m.expenseId ?? null,
        recorded_by: m.actor.id,
        recorded_by_label: m.actor.full_name,
        created_at: m.now,
      })
      .run();
    return id;
  }

  // -------------------------------------------------------------------------
  // Expense integration — always called inside the expense's transaction
  // -------------------------------------------------------------------------

  /**
   * Turns form lines into stock-linked lines: existing items are checked,
   * new ones are created (or matched to an existing item of the same name,
   * so a purchase never duplicates a material).
   */
  resolveExpenseLines(tx: Tx, lines: ExpenseLineInput[], actor: Actor, now: Date): ResolvedLine[] {
    const seen = new Set<string>();
    return lines.map((line) => {
      let item: { id: string; name: string; unit: StockUnit; is_active: boolean } | undefined;

      if (line.stock_item_id) {
        const row = tx.select().from(stockItems).where(eq(stockItems.id, line.stock_item_id)).get();
        if (!row) throw new BadRequestException("Une matière sélectionnée n'existe plus");
        item = { id: row.id, name: row.name, unit: row.unit as StockUnit, is_active: Boolean(row.is_active) };
      } else if (line.new_item) {
        const key = nameKey(line.new_item.name);
        const existing = tx.select().from(stockItems).where(eq(stockItems.name_key, key)).get();
        if (existing) {
          if (existing.unit !== line.new_item.unit) {
            throw new ConflictException(
              `« ${existing.name} » existe déjà en ${STOCK_UNIT_LABELS[existing.unit as StockUnit]} — sélectionnez-le dans la liste`,
            );
          }
          item = {
            id: existing.id,
            name: existing.name,
            unit: existing.unit as StockUnit,
            is_active: Boolean(existing.is_active),
          };
        } else {
          const id = this.insertItemTx(tx, line.new_item, actor, now);
          item = { id, name: cleanName(line.new_item.name), unit: line.new_item.unit, is_active: true };
        }
      } else {
        throw new BadRequestException("Chaque ligne doit indiquer une matière");
      }

      if (!item.is_active) {
        throw new ConflictException(`« ${item.name} » est archivé — réactivez-le dans le stock`);
      }
      if (seen.has(item.id)) {
        throw new BadRequestException(`« ${item.name} » figure deux fois dans la dépense — regroupez les quantités`);
      }
      seen.add(item.id);

      return {
        stock_item_id: item.id,
        item_name: item.name,
        item_unit: item.unit,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: lineTotal(line.quantity, line.unit_price),
      };
    });
  }

  /**
   * Books per-item deltas for an expense. Any delta that would push an item
   * below zero (the material was already used) aborts the whole transaction.
   */
  bookExpenseDeltas(tx: Tx, deltas: Map<string, number>, booking: ExpenseBooking, actor: Actor, now: Date) {
    for (const [itemId, delta] of deltas) {
      if (delta < 0) {
        const current = this.quantityOf(tx, itemId);
        if (current + delta < 0) {
          const item = tx.select().from(stockItems).where(eq(stockItems.id, itemId)).get()!;
          const unit = STOCK_UNIT_LABELS[item.unit as StockUnit];
          throw new ConflictException(
            `Impossible : le stock de « ${item.name} » deviendrait négatif ` +
              `(disponible ${formatQty(current, unit)}, à retirer ${formatQty(-delta, unit)}). ` +
              `Une partie a déjà été utilisée — enregistrez d'abord un inventaire.`,
          );
        }
      }
      this.insertMovement(tx, {
        itemId,
        kind: booking.kind,
        quantity: delta,
        unitCost: delta > 0 ? (booking.unitCosts?.get(itemId) ?? null) : null,
        reason: booking.reason,
        date: booking.date,
        expenseId: booking.expenseId,
        actor,
        now,
      });
    }
  }
}

function pick(i: StockItem) {
  return {
    name: i.name,
    kind: i.kind,
    category: i.category,
    unit: i.unit,
    min_threshold: i.min_threshold,
    note: i.note,
  };
}
