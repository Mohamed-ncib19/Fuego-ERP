import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import { expenses } from "../db/schema";
import type { CreateExpenseDto, UpdateExpenseDto } from "./dto/expenses.dto";
import type { Expense, PageMeta } from "@fuego/shared";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateExpenseDto, actor: Actor): Promise<Expense> {
    const id = randomUUID();
    const date = dto.date || new Date().toISOString().split("T")[0];
    const now = new Date();

    this.db.client.insert(expenses).values({
      id,
      category: dto.category,
      amount: dto.amount,
      note: dto.note?.trim() || null,
      date,
      recorded_by: actor.id,
      recorded_by_label: actor.full_name,
      created_at: now,
    }).run();

    void this.audit.record({
      action: "expense.created",
      entityType: "expense",
      entityId: id,
      entityLabel: `${dto.category} - ${dto.amount} millimes`,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { category: dto.category, amount: dto.amount, date },
    });

    return this.get(id);
  }

  async get(id: string): Promise<Expense> {
    const row = this.db.client.select().from(expenses).where(eq(expenses.id, id)).get();
    if (!row) {
      throw new NotFoundException("Dépense introuvable");
    }
    return {
      id: row.id,
      category: row.category as any,
      amount: row.amount,
      note: row.note,
      date: row.date,
      recorded_by: row.recorded_by,
      recorded_by_label: row.recorded_by_label,
      created_at: new Date(row.created_at).toISOString(),
    };
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

    return {
      data: rows.map((r) => ({
        id: r.id,
        category: r.category as any,
        amount: r.amount,
        note: r.note,
        date: r.date,
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

  async delete(id: string, actor: Actor): Promise<{ ok: boolean }> {
    const existing = await this.get(id);
    if (actor.role !== "super_admin" && existing.recorded_by !== actor.id) {
      throw new ForbiddenException("Seul un administrateur peut supprimer cette dépense");
    }

    this.db.client.delete(expenses).where(eq(expenses.id, id)).run();

    void this.audit.record({
      action: "expense.deleted",
      entityType: "expense",
      entityId: id,
      entityLabel: `${existing.category} - ${existing.amount} millimes`,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { existing },
    });

    return { ok: true };
  }
}
