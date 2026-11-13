import { describe, it, expect } from "vitest";
import { itemsTotal, grandTotal, paidAmount, reste, formatTicketNo, counterName } from "./orders.money";

describe("orders.money — pure functions", () => {
  // itemsTotal
  it("sums qty × unit_price", () => {
    const items = [
      { quantity: 2, unit_price: 5000 },
      { quantity: 1, unit_price: 3000 },
    ];
    expect(itemsTotal(items)).toBe(13000);
  });

  // grandTotal
  it("adds delivery fee to total", () => {
    expect(grandTotal(8000, 500)).toBe(8500);
  });

  // paidAmount
  it("refund lowers paid total", () => {
    const payments = [
      { kind: "advance" as const, amount: 20000 },
      { kind: "balance" as const, amount: 5000 },
      { kind: "refund" as const, amount: 3000 },
    ];
    expect(paidAmount(payments)).toBe(22000);
  });

  // reste
  it("preserves negative reste for overpay", () => {
    expect(reste(8500, 9000)).toBe(-500);
  });

  // formatTicketNo
  it("formats ticket number with zero-padded sequence", () => {
    expect(formatTicketNo(2026, 7)).toBe("CMD-2026-0007");
    expect(formatTicketNo(2026, 1)).toBe("CMD-2026-0001");
    expect(formatTicketNo(2026, 100)).toBe("CMD-2026-0100");
  });

  // counterName
  it("produces ticket counter name", () => {
    expect(counterName(2026)).toBe("ticket_2026");
    expect(counterName(2027)).toBe("ticket_2027");
  });
});