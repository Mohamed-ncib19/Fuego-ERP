import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, desc, asc, eq, sql } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import {
  orders,
  orderItems,
  orderEvents,
  payments,
  counters,
} from "../db/schema";
import {
  itemsTotal,
  grandTotal,
  paidAmount,
  reste,
  formatTicketNo,
  counterName,
} from "./orders.money";
import type {
  CreateOrderDto,
  UpdateOrderDto,
  RecordPaymentDto,
  AddOrderNoteDto,
} from "./dto/orders.dto";
import type {
  OrderDetail,
  OrderItem,
  OrderSummary,
  OrderStatus,
  OrderType,
  PaymentKind,
  OrderEventType,
  PageMeta,
} from "@fuego/shared";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Create a draft or full order. Requires at least one client name, description or item. */
  async createOrder(dto: CreateOrderDto, actor: Actor): Promise<OrderDetail> {
    const hasClient = Boolean(dto.customer_name?.trim() || dto.description?.trim());
    const hasItems = Boolean(dto.items && dto.items.length > 0);
    if (!hasClient && !hasItems) {
      throw new BadRequestException("Renseignez au moins un client, une description ou un article");
    }

    if (dto.order_type === "online" && !dto.delivery_address?.trim()) {
      throw new BadRequestException("L'adresse de livraison est obligatoire pour une commande en ligne");
    }

    const orderType: OrderType = dto.order_type ?? "local";
    const deliveryFee = orderType === "local" ? 0 : (dto.delivery_fee ?? 0);
    const totalAmount = itemsTotal(dto.items ?? []);
    const grand = grandTotal(totalAmount, deliveryFee);

    const year = new Date().getFullYear();
    const cName = counterName(year);

    // Atomic counter sequence increment in SQLite
    const counterRow = this.db.raw
      .prepare(
        `INSERT INTO counters(name, value) VALUES(?, 1)
         ON CONFLICT(name) DO UPDATE SET value = value + 1
         RETURNING value`,
      )
      .get(cName) as { value: number };

    const seq = counterRow.value;
    const ticketNo = formatTicketNo(year, seq);
    const orderId = randomUUID();
    const now = new Date();

    this.db.client.transaction((trx) => {
      trx.insert(orders).values({
        id: orderId,
        ticket_no: ticketNo,
        ticket_year: year,
        ticket_seq: seq,
        customer_name: dto.customer_name?.trim() || "",
        customer_phone: dto.customer_phone?.trim() || null,
        description: dto.description?.trim() || null,
        order_type: orderType,
        delivery_address: orderType === "online" ? dto.delivery_address?.trim() || null : null,
        delivery_fee: deliveryFee,
        total_amount: totalAmount,
        status: "pending",
        due_date: dto.due_date || null,
        created_by: actor.id,
        created_at: now,
        updated_at: now,
      }).run();

      if (dto.items && dto.items.length > 0) {
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i];
          trx.insert(orderItems).values({
            id: randomUUID(),
            order_id: orderId,
            position: i,
            label: it.label.trim(),
            quantity: it.quantity,
            unit_price: it.unit_price,
          }).run();
        }
      }

      trx.insert(orderEvents).values({
        id: randomUUID(),
        order_id: orderId,
        type: "created",
        payload: JSON.stringify({
          order_type: orderType,
          total_amount: totalAmount,
          delivery_fee: deliveryFee,
          grand_total: grand,
          items_count: dto.items?.length ?? 0,
        }),
        actor_id: actor.id,
        actor_label: actor.full_name,
        created_at: now,
      }).run();
    });

    void this.audit.record({
      action: "order.created",
      entityType: "order",
      entityId: orderId,
      entityLabel: ticketNo,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { order_type: orderType, total_amount: totalAmount, grand_total: grand },
    });

    return this.getOrder(orderId);
  }

  /** List orders with filters, search, pagination. */
  async listOrders(params: {
    status?: string;
    order_type?: string;
    search?: string;
    from?: string;
    to?: string;
    overdue?: boolean;
    limit?: number;
    page?: number;
  }): Promise<{ data: OrderSummary[]; meta: PageMeta }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 200);

    const conditions = [];

    if (params.status) {
      const statuses = params.status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(orders.status, statuses[0]));
      } else if (statuses.length > 1) {
        conditions.push(
          sql`${orders.status} IN (${sql.join(
            statuses.map((s) => sql`${s}`),
            sql`, `,
          )})`,
        );
      }
    }

    if (params.order_type) {
      conditions.push(eq(orders.order_type, params.order_type));
    }

    if (params.search?.trim()) {
      const term = "%" + params.search.trim().toLowerCase() + "%";
      conditions.push(
        sql`(lower(${orders.ticket_no}) LIKE ${term} OR lower(${orders.customer_name}) LIKE ${term} OR lower(coalesce(${orders.customer_phone}, '')) LIKE ${term})`,
      );
    }

    if (params.from) {
      const fromMs = new Date(params.from).getTime();
      if (!Number.isNaN(fromMs)) {
        conditions.push(sql`${orders.created_at} >= ${fromMs}`);
      }
    }

    if (params.to) {
      const toMs = new Date(params.to).getTime() + 86400000 - 1;
      if (!Number.isNaN(toMs)) {
        conditions.push(sql`${orders.created_at} <= ${toMs}`);
      }
    }

    if (params.overdue) {
      conditions.push(
        sql`${orders.due_date} IS NOT NULL AND date(${orders.due_date}) < date('now') AND ${orders.status} NOT IN ('delivered', 'cancelled')`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Direct SQLite queries for high performance and clean computed columns
    const countRow = this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(where)
      .get() as { count: number } | undefined;

    const total = countRow?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const rows = this.db.client
      .select({
        id: orders.id,
        ticket_no: orders.ticket_no,
        ticket_year: orders.ticket_year,
        ticket_seq: orders.ticket_seq,
        customer_name: orders.customer_name,
        customer_phone: orders.customer_phone,
        description: orders.description,
        order_type: orders.order_type,
        delivery_address: orders.delivery_address,
        delivery_fee: orders.delivery_fee,
        total_amount: orders.total_amount,
        status: orders.status,
        due_date: orders.due_date,
        created_by: orders.created_by,
        confirmed_by: orders.confirmed_by,
        created_at: orders.created_at,
        updated_at: orders.updated_at,
        items_count: sql<number>`(SELECT count(*) FROM order_items WHERE order_items.order_id = orders.id)`,
        paid: sql<number>`coalesce((SELECT sum(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) FROM payments WHERE payments.order_id = orders.id), 0)`,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.created_at))
      .offset((page - 1) * limit)
      .limit(limit)
      .all();

    const data: OrderSummary[] = rows.map((r) => {
      const paid = Number(r.paid) || 0;
      const totalAmount = Number(r.total_amount) || 0;
      const fee = Number(r.delivery_fee) || 0;
      const grand = grandTotal(totalAmount, fee);
      const rest = reste(grand, paid);

      return {
        id: r.id,
        ticket_no: r.ticket_no,
        ticket_year: r.ticket_year,
        ticket_seq: r.ticket_seq,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        description: r.description,
        order_type: r.order_type as OrderType,
        delivery_address: r.delivery_address,
        total_amount: totalAmount,
        delivery_fee: fee,
        grand_total: grand,
        paid,
        reste: rest,
        status: r.status as OrderStatus,
        due_date: r.due_date,
        created_by: r.created_by,
        confirmed_by: r.confirmed_by,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_at).toISOString(),
        items_count: Number(r.items_count) || 0,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /** Get full order detail with items, payments, and events. */
  async getOrder(id: string): Promise<OrderDetail> {
    const orderRow = this.db.client.select().from(orders).where(eq(orders.id, id)).get();
    if (!orderRow) {
      throw new NotFoundException("Commande introuvable");
    }

    const itemsRows = this.db.client
      .select()
      .from(orderItems)
      .where(eq(orderItems.order_id, id))
      .orderBy(asc(orderItems.position))
      .all();

    const paymentRows = this.db.client
      .select()
      .from(payments)
      .where(eq(payments.order_id, id))
      .orderBy(desc(payments.created_at))
      .all();

    const eventRows = this.db.client
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.order_id, id))
      .orderBy(desc(orderEvents.created_at))
      .all();

    const mappedPayments = paymentRows.map((p) => ({
      kind: p.kind as PaymentKind,
      amount: p.amount,
    }));
    const paid = paidAmount(mappedPayments);
    const totalAmount = orderRow.total_amount;
    const fee = orderRow.delivery_fee;
    const grand = grandTotal(totalAmount, fee);
    const rest = reste(grand, paid);

    return {
      id: orderRow.id,
      ticket_no: orderRow.ticket_no,
      ticket_year: orderRow.ticket_year,
      ticket_seq: orderRow.ticket_seq,
      customer_name: orderRow.customer_name,
      customer_phone: orderRow.customer_phone,
      description: orderRow.description,
      order_type: orderRow.order_type as OrderType,
      delivery_address: orderRow.delivery_address,
      status: orderRow.status as OrderStatus,
      due_date: orderRow.due_date,
      created_by: orderRow.created_by,
      confirmed_by: orderRow.confirmed_by,
      created_at: new Date(orderRow.created_at).toISOString(),
      updated_at: new Date(orderRow.updated_at).toISOString(),
      total_amount: totalAmount,
      delivery_fee: fee,
      grand_total: grand,
      paid,
      reste: rest,
      items: itemsRows.map((it) => ({
        id: it.id,
        order_id: it.order_id,
        position: it.position,
        label: it.label,
        quantity: it.quantity,
        unit_price: it.unit_price,
      })),
      payments: paymentRows.map((p) => ({
        id: p.id,
        order_id: p.order_id,
        kind: p.kind as PaymentKind,
        amount: p.amount,
        note: p.note,
        recorded_by: p.recorded_by,
        recorded_by_label: p.recorded_by_label,
        created_at: new Date(p.created_at).toISOString(),
      })),
      events: eventRows.map((e) => ({
        id: e.id,
        order_id: e.order_id,
        type: e.type as OrderEventType,
        payload: e.payload,
        actor_id: e.actor_id,
        actor_label: e.actor_label,
        created_at: new Date(e.created_at).toISOString(),
      })),
    };
  }

  /** Update order fields following edit rules (spec §5.3). */
  async updateOrder(id: string, dto: UpdateOrderDto, actor: Actor): Promise<OrderDetail> {
    const existing = await this.getOrder(id);

    // Rule: Delivered or Cancelled orders cannot change money
    const isClosed = existing.status === "delivered" || existing.status === "cancelled";
    const changingMoney = dto.items !== undefined || dto.delivery_fee !== undefined;
    if (isClosed && changingMoney) {
      throw new ConflictException("Impossible de modifier le montant d'une commande livrée ou annulée");
    }

    // Rule: order_type cannot be changed after confirmation
    if (existing.status !== "pending" && dto.order_type && dto.order_type !== existing.order_type) {
      throw new ConflictException("Le type de commande ne peut plus être modifié après confirmation");
    }

    const orderType = dto.order_type ?? existing.order_type;
    if (orderType === "online") {
      const address = dto.delivery_address !== undefined ? dto.delivery_address : existing.delivery_address;
      if (!address?.trim()) {
        throw new BadRequestException("L'adresse de livraison est obligatoire pour une commande en ligne");
      }
    }

    const fee = orderType === "local" ? 0 : (dto.delivery_fee !== undefined ? dto.delivery_fee : existing.delivery_fee);
    const newItems = dto.items !== undefined ? dto.items : existing.items;
    const newTotal = itemsTotal(newItems);
    const newGrand = grandTotal(newTotal, fee);

    const now = new Date();
    const moneyChanged = newTotal !== existing.total_amount || fee !== existing.delivery_fee;

    this.db.client.transaction((trx) => {
      trx.update(orders)
        .set({
          customer_name: dto.customer_name !== undefined ? dto.customer_name.trim() : existing.customer_name,
          customer_phone: dto.customer_phone !== undefined ? dto.customer_phone.trim() || null : existing.customer_phone,
          description: dto.description !== undefined ? dto.description.trim() || null : existing.description,
          order_type: orderType,
          delivery_address: orderType === "online" ? (dto.delivery_address !== undefined ? dto.delivery_address.trim() || null : existing.delivery_address) : null,
          delivery_fee: fee,
          total_amount: newTotal,
          due_date: dto.due_date !== undefined ? dto.due_date || null : existing.due_date,
          updated_at: now,
        })
        .where(eq(orders.id, id))
        .run();

      if (dto.items !== undefined) {
        trx.delete(orderItems).where(eq(orderItems.order_id, id)).run();
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i];
          trx.insert(orderItems).values({
            id: randomUUID(),
            order_id: id,
            position: i,
            label: it.label.trim(),
            quantity: it.quantity,
            unit_price: it.unit_price,
          }).run();
        }
      }

      if (moneyChanged) {
        trx.insert(orderEvents).values({
          id: randomUUID(),
          order_id: id,
          type: "edited",
          payload: JSON.stringify({
            before: { total_amount: existing.total_amount, delivery_fee: existing.delivery_fee, grand_total: existing.grand_total },
            after: { total_amount: newTotal, delivery_fee: fee, grand_total: newGrand },
          }),
          actor_id: actor.id,
          actor_label: actor.full_name,
          created_at: now,
        }).run();
      }
    });

    void this.audit.record({
      action: "order.updated",
      entityType: "order",
      entityId: id,
      entityLabel: existing.ticket_no,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { dto },
    });

    return this.getOrder(id);
  }

  /** Confirm draft order. Requires at least one item. */
  async confirmOrder(id: string, actor: Actor): Promise<OrderDetail> {
    const existing = await this.getOrder(id);
    if (existing.status !== "pending") {
      throw new ConflictException("Transition impossible depuis le statut actuel");
    }
    if (existing.items.length === 0) {
      throw new ConflictException("Ajoutez au moins un article avant de confirmer");
    }

    const now = new Date();
    this.db.client.transaction((trx) => {
      trx.update(orders)
        .set({
          status: "confirmed",
          confirmed_by: actor.id,
          updated_at: now,
        })
        .where(eq(orders.id, id))
        .run();

      trx.insert(orderEvents).values({
        id: randomUUID(),
        order_id: id,
        type: "confirmed",
        payload: null,
        actor_id: actor.id,
        actor_label: actor.full_name,
        created_at: now,
      }).run();
    });

    void this.audit.record({
      action: "order.confirmed",
      entityType: "order",
      entityId: id,
      entityLabel: existing.ticket_no,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
    });

    return this.getOrder(id);
  }

  /** Move confirmed order to in_progress. */
  async startOrder(id: string, actor: Actor): Promise<OrderDetail> {
    const existing = await this.getOrder(id);
    if (existing.status !== "confirmed") {
      throw new ConflictException("Transition impossible depuis le statut actuel");
    }

    const now = new Date();
    this.db.client.transaction((trx) => {
      trx.update(orders).set({ status: "in_progress", updated_at: now }).where(eq(orders.id, id)).run();
      trx.insert(orderEvents).values({
        id: randomUUID(),
        order_id: id,
        type: "started",
        payload: null,
        actor_id: actor.id,
        actor_label: actor.full_name,
        created_at: now,
      }).run();
    });

    void this.audit.record({
      action: "order.started",
      entityType: "order",
      entityId: id,
      entityLabel: existing.ticket_no,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
    });

    return this.getOrder(id);
  }

  /** Move in_progress order to ready. */
  async readyOrder(id: string, actor: Actor): Promise<OrderDetail> {
    const existing = await this.getOrder(id);
    if (existing.status !== "in_progress") {
      throw new ConflictException("Transition impossible depuis le statut actuel");
    }

    const now = new Date();
    this.db.client.transaction((trx) => {
      trx.update(orders).set({ status: "ready", updated_at: now }).where(eq(orders.id, id)).run();
      trx.insert(orderEvents).values({
        id: randomUUID(),
        order_id: id,
        type: "readied",
        payload: null,
        actor_id: actor.id,
        actor_label: actor.full_name,
        created_at: now,
      }).run();
    });

    void this.audit.record({
      action: "order.readied",
      entityType: "order",
      entityId: id,
      entityLabel: existing.ticket_no,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
    });

    return this.getOrder(id);
  }

  /** Deliver order. Requires reste <= 0 unless forced by super_admin. */
  async deliverOrder(id: string, actor: Actor, force = false): Promise<OrderDetail> {
    const existing = await this.getOrder(id);
    if (existing.status === "delivered" || existing.status === "cancelled") {
      throw new ConflictException("Transition impossible depuis le statut actuel");
    }

    const isOverdueOrUnpaid = existing.reste > 0;
    if (isOverdueOrUnpaid) {
      const canForce = force && actor.role === "super_admin";
      if (!canForce) {
        throw new ConflictException("Le solde doit être réglé avant la livraison");
      }
    }

    const now = new Date();
    this.db.client.transaction((trx) => {
      trx.update(orders).set({ status: "delivered", updated_at: now }).where(eq(orders.id, id)).run();
      trx.insert(orderEvents).values({
        id: randomUUID(),
        order_id: id,
        type: "delivered",
        payload: isOverdueOrUnpaid ? JSON.stringify({ forced: true, reste: existing.reste }) : null,
        actor_id: actor.id,
        actor_label: actor.full_name,
        created_at: now,
      }).run();
    });

    void this.audit.record({
      action: "order.delivered",
      entityType: "order",
      entityId: id,
      entityLabel: existing.ticket_no,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { forced: isOverdueOrUnpaid && force },
    });

    return this.getOrder(id);
  }

  /** Cancel order. */
  async cancelOrder(id: string, actor: Actor, reason?: string): Promise<OrderDetail> {
    const existing = await this.getOrder(id);
    if (existing.status === "delivered" || existing.status === "cancelled") {
      throw new ConflictException("Transition impossible depuis le statut actuel");
    }

    const now = new Date();
    this.db.client.transaction((trx) => {
      trx.update(orders).set({ status: "cancelled", updated_at: now }).where(eq(orders.id, id)).run();
      trx.insert(orderEvents).values({
        id: randomUUID(),
        order_id: id,
        type: "cancelled",
        payload: JSON.stringify({ reason: reason?.trim() || null, reste: existing.reste }),
        actor_id: actor.id,
        actor_label: actor.full_name,
        created_at: now,
      }).run();
    });

    void this.audit.record({
      action: "order.cancelled",
      entityType: "order",
      entityId: id,
      entityLabel: existing.ticket_no,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { reason },
    });

    return this.getOrder(id);
  }

  /** Append note to order timeline. */
  async addNote(id: string, dto: AddOrderNoteDto, actor: Actor): Promise<OrderDetail> {
    const existing = await this.getOrder(id);
    const now = new Date();

    this.db.client.insert(orderEvents).values({
      id: randomUUID(),
      order_id: id,
      type: "note",
      payload: JSON.stringify({ note: dto.note.trim() }),
      actor_id: actor.id,
      actor_label: actor.full_name,
      created_at: now,
    }).run();

    return this.getOrder(id);
  }

  /** Record immutable payment / refund. */
  async recordPayment(id: string, dto: RecordPaymentDto, actor: Actor): Promise<OrderDetail> {
    const existing = await this.getOrder(id);

    if ((existing.status === "delivered" || existing.status === "cancelled") && dto.kind !== "refund") {
      throw new ConflictException("Seul le remboursement est autorisé sur une commande livrée ou annulée");
    }

    if (dto.kind === "refund") {
      if (dto.amount > existing.paid) {
        throw new BadRequestException("Le remboursement dépasse le montant payé");
      }
    }

    const now = new Date();
    const paymentId = randomUUID();

    this.db.client.insert(payments).values({
      id: paymentId,
      order_id: id,
      kind: dto.kind,
      amount: dto.amount,
      note: dto.note?.trim() || null,
      recorded_by: actor.id,
      recorded_by_label: actor.full_name,
      created_at: now,
    }).run();

    const newPaid = dto.kind === "refund" ? existing.paid - dto.amount : existing.paid + dto.amount;
    const resteAfter = reste(existing.grand_total, newPaid);

    void this.audit.record({
      action: "order.payment_recorded",
      entityType: "order",
      entityId: id,
      entityLabel: existing.ticket_no,
      actorId: actor.id,
      actorLabel: actor.full_name,
      actorRole: actor.role,
      meta: { kind: dto.kind, amount: dto.amount, reste_after: resteAfter },
    });

    return this.getOrder(id);
  }
}
