/**
 * @fuego/shared — enums and types imported by both the backend and the
 * renderer. Kept deliberately small (same discipline as the reference's
 * @iq/shared): the source of truth for shared vocabulary lives here.
 */

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export type UserRole = "super_admin" | "staff";

export const USER_ROLES: UserRole[] = ["super_admin", "staff"];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Administrateur",
  staff: "Employé",
};

/** A user as returned by every auth/users endpoint (never the hash). */
export interface SafeUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Orders (Phase 1 vocabulary, locked here so both sides agree early)
// ---------------------------------------------------------------------------

export type OrderType = "local" | "online";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "ready"
  | "delivered"
  | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "in_progress",
  "ready",
  "delivered",
  "cancelled",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  in_progress: "En cours",
  ready: "Prête",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  local: "Local",
  online: "En ligne",
};

export type PaymentKind = "advance" | "balance" | "refund";

export const PAYMENT_KINDS: PaymentKind[] = ["advance", "balance", "refund"];

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  advance: "Avance",
  balance: "Solde",
  refund: "Remboursement",
};

export type OrderEventType =
  | "created"
  | "edited"
  | "confirmed"
  | "started"
  | "readied"
  | "delivered"
  | "cancelled"
  | "note";

export const ORDER_EVENT_TYPES: OrderEventType[] = [
  "created",
  "edited",
  "confirmed",
  "started",
  "readied",
  "delivered",
  "cancelled",
  "note",
];

export const ORDER_EVENT_LABELS: Record<OrderEventType, string> = {
  created: "Création",
  edited: "Modification",
  confirmed: "Confirmée",
  started: "Démarrée",
  readied: "Prête",
  delivered: "Livrée",
  cancelled: "Annulée",
  note: "Note",
};

/** One article line — the source of `total_amount`. */
export interface OrderItem {
  id: string;
  order_id: string;
  /** Display order, zero-based. */
  position: number;
  label: string;
  quantity: number;
  /** Integer millimes. */
  unit_price: number;
}

/** Append-only timeline row; `payload` is JSON text (diff, note, forced meta). */
export interface OrderEvent {
  id: string;
  order_id: string;
  type: OrderEventType;
  payload: string | null;
  actor_id: string;
  actor_label: string;
  created_at: string;
}

/** Append-only money ledger row; `refund` subtracts from `paid`. */
export interface Payment {
  id: string;
  order_id: string;
  kind: PaymentKind;
  /** Integer millimes, always ≥ 1. */
  amount: number;
  note: string | null;
  recorded_by: string;
  recorded_by_label: string;
  created_at: string;
}

/** Derived money block — integer millimes, never floats. */
export interface OrderMoney {
  /** Σ(quantity × unit_price). */
  total_amount: number;
  delivery_fee: number;
  grand_total: number;
  paid: number;
  /** `grand_total − paid`, raw: negative means the client overpaid (credit). */
  reste: number;
}

/** The order row as returned on the wire (timestamps are ISO strings). */
export interface Order {
  id: string;
  /** `CMD-<year>-<4-digit seq>`, e.g. `CMD-2026-0007`. */
  ticket_no: string;
  ticket_year: number;
  ticket_seq: number;
  /** Empty string for a draft saved before the customer was known. */
  customer_name: string;
  customer_phone: string | null;
  description: string | null;
  order_type: OrderType;
  /** Required iff `order_type = "online"`. */
  delivery_address: string | null;
  status: OrderStatus;
  /** `YYYY-MM-DD` promise date. */
  due_date: string | null;
  created_by: string;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

/** List row: order + derived money + article count (0 flags an incomplete draft). */
export interface OrderSummary extends Order, OrderMoney {
  items_count: number;
}

/** Detail row: order + derived money + the three child collections. */
export interface OrderDetail extends Order, OrderMoney {
  items: OrderItem[];
  payments: Payment[];
  events: OrderEvent[];
}

// ---------------------------------------------------------------------------
// API envelope — every endpoint answers { data, meta, error } like the
// reference system; clients unwrap through lib/api/client.ts.
// ---------------------------------------------------------------------------

export interface ApiEnvelope<T> {
  data: T | null;
  meta?: Record<string, unknown>;
  error?: { message: string; code?: string; details?: unknown } | null;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
