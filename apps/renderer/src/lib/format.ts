import { QTY_SCALE, STOCK_UNIT_LABELS, stockLineTotal, type StockUnit, type UserRole } from "@fuego/shared";

/** Stock quantity (thousandths of a unit) → "12,5 kg". */
export function formatQty(quantity: number, unit?: StockUnit): string {
  const v = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(quantity / QTY_SCALE);
  return unit ? `${v} ${STOCK_UNIT_LABELS[unit]}` : v;
}

/** Signed quantity for ledgers: "+2,5 kg" / "−1 kg". */
export function formatSignedQty(quantity: number, unit?: StockUnit): string {
  const sign = quantity > 0 ? "+" : quantity < 0 ? "−" : "";
  return `${sign}${formatQty(Math.abs(quantity), unit)}`;
}

/**
 * "2,5" / "2.5" / "1 250,75" → integer thousandths (2500). Returns null for
 * anything that is not a non-negative number with at most 3 decimals.
 */
export function parseScaled(input: string): number | null {
  const s = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,3})?$/.test(s) && !/^\.\d{1,3}$/.test(s)) return null;
  return Math.round(parseFloat(s) * QTY_SCALE);
}

/** Integer thousandths → editable text ("2,5"). */
export function scaledToInput(value: number): string {
  return String(value / QTY_SCALE).replace(".", ",");
}

/** Millimes for `quantity` thousandths of a unit at `unitPrice` millimes/unit (server rule). */
export const lineTotalOf = stockLineTotal;

/** "12,500" → 12500 millimes; null when not a valid non-negative amount. */
export function parseMoney(input: string): number | null {
  return parseScaled(input);
}

/** Local calendar day as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One idempotency key per opened form. */
export function newClientRef(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Money: stored as integer millimes (1 DT = 1000) — displayed "12,500 DT". */
export function formatMillimes(millimes: number): string {
  const dt = millimes / 1000;
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(dt);
  return `${formatted} DT`;
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export const roleLabel: Record<UserRole, string> = {
  super_admin: "Administrateur",
  staff: "Employé",
};
