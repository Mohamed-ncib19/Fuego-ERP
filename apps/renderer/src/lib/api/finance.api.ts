import { apiGet, apiPost, apiPatch, apiDelete } from "./client";
import type {
  Expense,
  ExpenseCategory,
  FinanceStats,
  PageMeta,
  PaymentKind,
  StockItemKind,
  StockUnit,
} from "@fuego/shared";

export interface ExpenseFilterParams {
  category?: ExpenseCategory;
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
}

export interface PaymentFilterParams {
  kind?: PaymentKind;
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
}

/** A purchased material: an existing stock item, or one to create with the expense. */
export interface ExpenseLinePayload {
  stock_item_id?: string;
  new_item?: { name: string; unit: StockUnit; kind?: StockItemKind; category?: string };
  quantity: number; // thousandths of the unit
  unit_price: number; // millimes per unit
}

export interface CreateExpensePayload {
  category: ExpenseCategory;
  /** Ignored by the server when lines are sent (it uses Σ line totals). */
  amount?: number; // millimes
  note?: string;
  date?: string; // YYYY-MM-DD
  lines?: ExpenseLinePayload[];
  /** Idempotency key — one per opened form. */
  client_ref?: string;
}

export type UpdateExpensePayload = Omit<CreateExpensePayload, "client_ref">;

export interface PaymentReceiptRow {
  id: string;
  order_id: string;
  ticket_no: string | null;
  customer_name: string | null;
  kind: PaymentKind;
  amount: number;
  note: string | null;
  recorded_by: string;
  recorded_by_label: string;
  created_at: string;
}

export const financeApi = {
  getStats(): Promise<FinanceStats> {
    return apiGet<FinanceStats>("/finance/stats").then((r) => r.data);
  },

  listPayments(params?: PaymentFilterParams): Promise<{
    data: PaymentReceiptRow[];
    meta: PageMeta;
    totalAmount: number;
  }> {
    return apiGet<PaymentReceiptRow[], PageMeta>("/finance/payments", params as any).then(
      (r) => ({
        data: r.data,
        meta: r.meta as PageMeta,
        totalAmount: (r as any).totalAmount ?? 0,
      }),
    );
  },
};

export const expensesApi = {
  list(params?: ExpenseFilterParams): Promise<{
    data: Expense[];
    meta: PageMeta;
    totalAmount: number;
  }> {
    return apiGet<Expense[], PageMeta>("/expenses", params as any).then((r) => ({
      data: r.data,
      meta: r.meta as PageMeta,
      totalAmount: (r as any).totalAmount ?? 0,
    }));
  },

  create(payload: CreateExpensePayload): Promise<Expense> {
    return apiPost<Expense>("/expenses", payload);
  },

  update(id: string, payload: UpdateExpensePayload): Promise<Expense> {
    return apiPatch<Expense>(`/expenses/${id}`, payload);
  },

  delete(id: string): Promise<{ ok: boolean }> {
    return apiDelete<{ ok: boolean }>(`/expenses/${id}`);
  },
};
