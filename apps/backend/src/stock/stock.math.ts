import { QTY_SCALE, stockLineTotal, stockNameKey } from "@fuego/shared";

/**
 * Pure stock arithmetic — integers only (quantities in thousandths of a
 * unit, money in millimes), kept apart from the service so it is trivially
 * testable. Name keys and line totals live in @fuego/shared so the expense
 * form computes exactly what the server stores.
 */

export const nameKey = stockNameKey;
export const lineTotal = stockLineTotal;

/** Display name: trimmed, inner whitespace collapsed, original casing kept. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Per-item net quantity a set of lines puts into the stock. Used to diff an
 * expense before and after an edit: the difference is the correction to book.
 */
export function netByItem(lines: Array<{ stock_item_id: string; quantity: number }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) out.set(l.stock_item_id, (out.get(l.stock_item_id) ?? 0) + l.quantity);
  return out;
}

/** after − before per item, zero deltas dropped. */
export function diffByItem(before: Map<string, number>, after: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(id) ?? 0) - (before.get(id) ?? 0);
    if (delta !== 0) out.set(id, delta);
  }
  return out;
}

/** YYYY-MM-DD in local time (the shop's calendar day, not UTC). */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "12,5 kg" style quantity for error messages. */
export function formatQty(quantity: number, unit: string): string {
  const v = quantity / QTY_SCALE;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${unit}`;
}
