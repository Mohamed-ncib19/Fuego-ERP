/** Money helpers for orders — pure integer arithmetic, millimes throughout.
 *  No decimal.js, no floats. Every function is deterministic and testable.
 */

export type PaymentKind = "advance" | "balance" | "refund";

export interface OrderItem {
  quantity: number;
  unit_price: number;
}

/** Sum of qty × unit_price across all items. */
export function itemsTotal(items: OrderItem[]): number {
  let total = 0;
  for (const { quantity, unit_price } of items) {
    total += quantity * unit_price;
  }
  return total;
}

/** grand_total = total_amount + delivery_fee. */
export function grandTotal(total: number, deliveryFee: number): number {
  return total + deliveryFee;
}

/** paid = Σ(advance+balance) − Σ(refund). */
export function paidAmount(payments: { kind: PaymentKind; amount: number }[]): number {
  let paid = 0;
  for (const { kind, amount } of payments) {
    if (kind === "refund") {
      paid -= amount;
    } else {
      paid += amount;
    }
  }
  return paid;
}

/** reste = grand_total − paid.  May be negative (overpaid = credit). */
export function reste(grand: number, paid: number): number {
  return grand - paid;
}

/** Format ticket number: CMD-YYYY-SSSS  (S zero-padded to 4 digits). */
export function formatTicketNo(year: number, seq: number): string {
  return `CMD-${year}-${String(seq).padStart(4, "0")}`;
}

/** Counter name for a given year: ticket_YYYY. */
export function counterName(year: number): string {
  return `ticket_${year}`;
}