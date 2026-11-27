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
// Orders (Phase 1 vocabulary)
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
  position: number;
  label: string;
  quantity: number;
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
  amount: number;
  note: string | null;
  recorded_by: string;
  recorded_by_label: string;
  created_at: string;
}

/** Derived money block — integer millimes, never floats. */
export interface OrderMoney {
  total_amount: number;
  delivery_fee: number;
  grand_total: number;
  paid: number;
  reste: number;
}

/** The order row as returned on the wire (timestamps are ISO strings). */
export interface Order {
  id: string;
  ticket_no: string;
  ticket_year: number;
  ticket_seq: number;
  customer_name: string;
  customer_phone: string | null;
  description: string | null;
  order_type: OrderType;
  delivery_address: string | null;
  status: OrderStatus;
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
// Finance & Expenses (Phase 2 vocabulary)
// ---------------------------------------------------------------------------

export type ExpenseCategory =
  | "materials"
  | "rent"
  | "salaries"
  | "equipment"
  | "marketing"
  | "utilities"
  | "other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "materials",
  "rent",
  "salaries",
  "equipment",
  "marketing",
  "utilities",
  "other",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: "Matières & Fournitures",
  rent: "Loyer & Bail",
  salaries: "Salaires & Rémunérations",
  equipment: "Maintenance & Équipement",
  marketing: "Publicité & Marketing",
  utilities: "Électricité, Eau & Internet",
  other: "Autres dépenses",
};

/** The only category whose expense lines feed the stock (Matières & Fournitures). */
export const STOCK_EXPENSE_CATEGORY: ExpenseCategory = "materials";

/** One purchased material on a "materials" expense — the link to the stock. */
export interface ExpenseLine {
  id: string;
  expense_id: string;
  position: number;
  stock_item_id: string;
  item_name: string;
  item_unit: StockUnit;
  /** Thousandths of the item's unit (1.5 kg = 1500). */
  quantity: number;
  /** Millimes per whole unit. */
  unit_price: number;
  /** Millimes: round(quantity × unit_price / 1000). */
  line_total: number;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number; // millimes
  note: string | null;
  date: string; // YYYY-MM-DD
  recorded_by: string;
  recorded_by_label: string;
  created_at: string;
  updated_at: string;
  /** Purchased materials (only on "materials" expenses); empty otherwise. */
  lines: ExpenseLine[];
}

// ---------------------------------------------------------------------------
// Stock (matières premières, fournitures, articles)
//
// Quantities are integers in thousandths of the item's unit — the same
// "no floats" discipline as money. An item's quantity is never stored: it is
// the sum of its append-only movements.
// ---------------------------------------------------------------------------

/** Scale between stored quantities and the unit shown to people (3 decimals). */
export const QTY_SCALE = 1000;

export type StockUnit = "kg" | "g" | "l" | "ml" | "m" | "cm" | "m2" | "unit" | "pack" | "roll" | "sheet";

export const STOCK_UNITS: StockUnit[] = ["unit", "kg", "g", "l", "ml", "m", "cm", "m2", "pack", "roll", "sheet"];

/** Short symbol shown after a quantity ("12,5 kg"). */
export const STOCK_UNIT_LABELS: Record<StockUnit, string> = {
  unit: "unité(s)",
  kg: "kg",
  g: "g",
  l: "L",
  ml: "ml",
  m: "m",
  cm: "cm",
  m2: "m²",
  pack: "paquet(s)",
  roll: "rouleau(x)",
  sheet: "feuille(s)",
};

/** Long name for pickers. */
export const STOCK_UNIT_NAMES: Record<StockUnit, string> = {
  unit: "Unité",
  kg: "Kilogramme (kg)",
  g: "Gramme (g)",
  l: "Litre (L)",
  ml: "Millilitre (ml)",
  m: "Mètre (m)",
  cm: "Centimètre (cm)",
  m2: "Mètre carré (m²)",
  pack: "Paquet",
  roll: "Rouleau",
  sheet: "Feuille",
};

export type StockItemKind = "raw_material" | "supply" | "product";

export const STOCK_ITEM_KINDS: StockItemKind[] = ["raw_material", "supply", "product"];

export const STOCK_ITEM_KIND_LABELS: Record<StockItemKind, string> = {
  raw_material: "Matière première",
  supply: "Fourniture",
  product: "Article",
};

/** Kinds listed under "Matières premières" (raw materials and supplies). */
export const MATERIAL_KINDS: StockItemKind[] = ["raw_material", "supply"];

export type StockLevel = "ok" | "low" | "out";

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  ok: "Disponible",
  low: "Stock bas",
  out: "Rupture",
};

/**
 * Accent-, case- and space-insensitive name key: "  Tissu  Coton " ≡
 * "tîssu coton". The backend's uniqueness rule and the expense form's
 * "already exists?" check use this same function.
 */
export function stockNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Millimes for `quantity` thousandths of a unit at `unitPrice` millimes per unit. */
export function stockLineTotal(quantity: number, unitPrice: number): number {
  return Math.round((quantity * unitPrice) / QTY_SCALE);
}

/** out when nothing is left, low at or under a set threshold, ok otherwise. */
export function stockLevel(quantity: number, minThreshold: number): StockLevel {
  if (quantity <= 0) return "out";
  if (minThreshold > 0 && quantity <= minThreshold) return "low";
  return "ok";
}

export type StockMovementKind =
  | "initial"
  | "purchase"
  | "purchase_correction"
  | "purchase_reversal"
  | "entry"
  | "exit"
  | "adjustment";

export const STOCK_MOVEMENT_KINDS: StockMovementKind[] = [
  "initial",
  "purchase",
  "purchase_correction",
  "purchase_reversal",
  "entry",
  "exit",
  "adjustment",
];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementKind, string> = {
  initial: "Stock initial",
  purchase: "Achat",
  purchase_correction: "Correction d'achat",
  purchase_reversal: "Annulation d'achat",
  entry: "Entrée",
  exit: "Sortie",
  adjustment: "Inventaire",
};

/** Manual movement a person records from the stock screen. */
export type ManualMovementType = "entry" | "exit" | "count";

export interface StockItem {
  id: string;
  name: string;
  kind: StockItemKind;
  category: string | null;
  unit: StockUnit;
  /** Thousandths of the unit; 0 = no alert. */
  min_threshold: number;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Σ movements, thousandths of the unit. */
  quantity: number;
  level: StockLevel;
  movements_count: number;
  last_movement_at: string | null;
  /** Millimes per unit of the latest purchase, null when never bought. */
  last_unit_cost: number | null;
}

export interface StockSummary {
  total: number;
  low: number;
  out: number;
  /** Σ quantity × last purchase price, millimes (items never bought count 0). */
  value: number;
}

export interface StockMovement {
  id: string;
  stock_item_id: string;
  item_name: string;
  item_unit: StockUnit;
  kind: StockMovementKind;
  /** Signed: positive enters the stock, negative leaves it. */
  quantity: number;
  /** Millimes per unit (purchases), null otherwise. */
  unit_cost: number | null;
  reason: string | null;
  date: string; // YYYY-MM-DD
  /** Set while the expense that caused it still exists. */
  expense_id: string | null;
  recorded_by: string;
  recorded_by_label: string;
  created_at: string;
  /** Running quantity right after this movement (history views). */
  balance_after?: number;
}

export interface FinanceStats {
  today: {
    revenue: number;
    expenses: number;
    net_profit: number;
    orders_count: number;
    delivered_count: number;
  };
  overall: {
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    outstanding_balances: number; // money owed by clients on active orders
    advances_held: number; // advances held on pending/confirmed/in_progress orders
    total_orders: number;
  };
  status_breakdown: Record<OrderStatus, number>;
  trend: {
    date: string; // YYYY-MM-DD
    revenue: number;
    expenses: number;
  }[];
}

// ---------------------------------------------------------------------------
// Audit & Settings (Phase 0 / Phase 3)
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  actor_id: string | null;
  actor_label: string | null;
  actor_role: string | null;
  ip_address: string | null;
  user_agent: string | null;
  prev_values: string | null;
  new_values: string | null;
  meta: string | null;
  created_at: string;
}

export interface AppSettings {
  id: string;
  business_name: string;
  currency: string;
  ticket_footer: string | null;
}

// ---------------------------------------------------------------------------
// API envelope
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

// ---------------------------------------------------------------------------
// Phone numbers — Tunisia only: constant +216 prefix and 8 national digits.
// Stored as the 8 digits ("22123456"), displayed as "+216 22 123 456".
// ---------------------------------------------------------------------------

export const PHONE_PREFIX = "+216";
export const PHONE_DIGITS = 8;

/** Keeps digits only, drops a typed/pasted 216 or 00216 prefix, caps at 8. */
export function normalizePhone(input: string | null | undefined): string {
  let digits = String(input ?? "").replace(/[^0-9]/g, "");
  if (digits.length > PHONE_DIGITS && digits.startsWith("00216")) digits = digits.slice(5);
  else if (digits.length > PHONE_DIGITS && digits.startsWith("216")) digits = digits.slice(3);
  return digits.slice(0, PHONE_DIGITS);
}

export function isValidPhone(input: string | null | undefined): boolean {
  return /^[0-9]{8}$/.test(String(input ?? ""));
}

/** National part grouped "xx xxx xxx" — works on partial input while typing. */
export function formatPhoneLocal(input: string | null | undefined): string {
  const d = normalizePhone(input);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8)].filter(Boolean).join(" ");
}

/** Full display form "+216 xx xxx xxx"; older free-text values pass through. */
export function formatPhone(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const d = normalizePhone(raw);
  return d.length === PHONE_DIGITS ? `${PHONE_PREFIX} ${formatPhoneLocal(d)}` : raw;
}
