import { apiGet, apiPatch, apiPost } from "./client";
import type {
  Expense,
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
  /** Millimes per unit: with a starting quantity the item is bought (a dépense is booked). */
  unit_price?: number;
  /** The starting quantity was already owned: initial stock, no dépense. */
  already_owned?: boolean;
  purchase_date?: string;
  supplier?: string;
  note?: string;
}

export type StockItemUpdate = Partial<
  Omit<StockItemPayload, "initial_quantity" | "unit_price" | "already_owned" | "purchase_date" | "supplier">
>;

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

  /** The created item, and the dépense when its starting quantity was a purchase. */
  createItem(payload: StockItemPayload): Promise<{ item: StockItem; expense: Expense | null }> {
    return apiPost<{ item: StockItem; expense: Expense | null }>("/stock/items", payload);
  },

  updateItem(id: string, payload: StockItemUpdate): Promise<StockItem> {
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
