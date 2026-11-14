import { apiGet, apiPatch, apiPost } from "./client";
import type {
  OrderDetail,
  OrderSummary,
  PageMeta,
  OrderType,
  PaymentKind,
} from "@fuego/shared";

export interface ListOrdersParams {
  status?: string;
  order_type?: string;
  search?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  limit?: number;
  page?: number;
}

export interface CreateOrderItemInput {
  label: string;
  quantity: number;
  unit_price: number;
}

export interface CreateOrderInput {
  customer_name?: string;
  customer_phone?: string;
  description?: string;
  order_type?: OrderType;
  delivery_address?: string;
  delivery_fee?: number;
  due_date?: string;
  items?: CreateOrderItemInput[];
}

export interface UpdateOrderInput {
  customer_name?: string;
  customer_phone?: string;
  description?: string;
  order_type?: OrderType;
  delivery_address?: string;
  delivery_fee?: number;
  due_date?: string;
  items?: CreateOrderItemInput[];
}

export interface ConfirmOrderInput {
  advance_amount?: number;
  note?: string;
}

export interface TransitionInput {
  force?: boolean;
  note?: string;
  reason?: string;
}

export interface RecordPaymentInput {
  kind: PaymentKind;
  amount: number;
  note?: string;
}

export interface AddOrderNoteInput {
  note: string;
}

export const ordersApi = {
  async list(params?: ListOrdersParams) {
    const res = await apiGet<OrderSummary[], PageMeta>("/orders", params as Record<string, unknown>);
    return { data: res.data ?? [], meta: res.meta };
  },
  async get(id: string): Promise<OrderDetail> {
    const res = await apiGet<OrderDetail>(`/orders/${id}`);
    return res.data;
  },
  create(payload: CreateOrderInput) {
    return apiPost<OrderDetail>("/orders", payload);
  },
  update(id: string, payload: UpdateOrderInput) {
    return apiPatch<OrderDetail>(`/orders/${id}`, payload);
  },
  confirm(id: string, payload: ConfirmOrderInput = {}) {
    return apiPost<OrderDetail>(`/orders/${id}/confirm`, payload);
  },
  start(id: string, payload: TransitionInput = {}) {
    return apiPost<OrderDetail>(`/orders/${id}/start`, payload);
  },
  ready(id: string, payload: TransitionInput = {}) {
    return apiPost<OrderDetail>(`/orders/${id}/ready`, payload);
  },
  deliver(id: string, payload: TransitionInput = {}) {
    return apiPost<OrderDetail>(`/orders/${id}/deliver`, payload);
  },
  cancel(id: string, payload: TransitionInput = {}) {
    return apiPost<OrderDetail>(`/orders/${id}/cancel`, payload);
  },
  addNote(id: string, payload: AddOrderNoteInput) {
    return apiPost<OrderDetail>(`/orders/${id}/notes`, payload);
  },
  recordPayment(id: string, payload: RecordPaymentInput) {
    return apiPost<OrderDetail>(`/orders/${id}/payments`, payload);
  },
};
