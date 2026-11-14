import { apiGet, apiPost, apiDelete } from "./client";
import type {
  Expense,
  ExpenseCategory,
  FinanceStats,
  PageMeta,
  PaymentKind,
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

export interface CreateExpensePayload {
  category: ExpenseCategory;
  amount: number; // millimes
  note?: string;
  date?: string; // YYYY-MM-DD
}

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

  delete(id: string): Promise<{ ok: boolean }> {
    return apiDelete<{ ok: boolean }>(`/expenses/${id}`);
  },
};
