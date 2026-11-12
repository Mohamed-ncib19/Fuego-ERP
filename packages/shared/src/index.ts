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

export type PaymentKind = "advance" | "balance" | "refund";

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
