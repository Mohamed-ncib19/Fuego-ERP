import { apiGet, apiPatch, apiPost } from "./client";
import type {
  ManualMovementType,
  PageMeta,
  StockItem,
  StockItemKind,
  StockLevel,
  StockMovement,
  StockMovementKind,
  StockSummary,
  StockUnit,
} from "@fuego/shared";

/** Quantities are integers in thousandths of the unit (see QTY_SCALE). */
export interface StockItemPayload {
  name: string;
  kind?: StockItemKind;
  category?: string;
  unit: StockUnit;
  min_threshold?: number;
  initial_quantity?: number;
  note?: string;
}

export interface StockItemFilter {
  search?: string;
  kind?: StockItemKind;
  scope?: "all" | "materials";
  level?: StockLevel;
  include_archived?: boolean;
}

export interface MovementFilter {
  item_id?: string;
  kind?: StockMovementKind;
  from?: string;
  to?: string;
  expense_id?: string;
  page?: number;
  limit?: number;
}

export const stockApi = {
  listItems(params?: StockItemFilter): Promise<{ data: StockItem[]; summary: StockSummary }> {
    return apiGet<StockItem[], { summary: StockSummary }>("/stock/items", params as any).then((r) => ({
      data: r.data,
      summary: r.meta!.summary,
    }));
  },

  getItem(id: string): Promise<StockItem> {
    return apiGet<StockItem>(`/stock/items/${id}`).then((r) => r.data);
  },

  categories(): Promise<string[]> {
    return apiGet<string[]>("/stock/categories").then((r) => r.data);
  },

  createItem(payload: StockItemPayload): Promise<StockItem> {
    return apiPost<StockItem>("/stock/items", payload);
  },

  updateItem(id: string, payload: Partial<Omit<StockItemPayload, "initial_quantity">>): Promise<StockItem> {
    return apiPatch<StockItem>(`/stock/items/${id}`, payload);
  },

  setActive(id: string, is_active: boolean): Promise<StockItem> {
    return apiPost<StockItem>(`/stock/items/${id}/active`, { is_active });
  },

  recordMovement(
    id: string,
    payload: { type: ManualMovementType; quantity: number; reason?: string; date?: string },
  ): Promise<StockMovement> {
    return apiPost<StockMovement>(`/stock/items/${id}/movements`, payload);
  },

  listMovements(params?: MovementFilter): Promise<{ data: StockMovement[]; meta: PageMeta }> {
    return apiGet<StockMovement[], PageMeta>("/stock/movements", params as any).then((r) => ({
      data: r.data,
      meta: r.meta as PageMeta,
    }));
  },
};
