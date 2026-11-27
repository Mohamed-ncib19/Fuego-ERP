import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stockApi, type MovementFilter, type StockItemFilter, type StockItemPayload } from "@/lib/api/stock.api";
import type { ManualMovementType } from "@fuego/shared";

/**
 * Stock queries. Every stock or expense write invalidates "stock",
 * "expenses" and "finance" together: one expense can change all three.
 */
export const stockKeys = {
  items: (f: StockItemFilter) => ["stock", "items", f] as const,
  item: (id: string) => ["stock", "item", id] as const,
  movements: (f: MovementFilter) => ["stock", "movements", f] as const,
  categories: ["stock", "categories"] as const,
};

export function useInvalidateStock() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useStockItems(filter: StockItemFilter, enabled = true) {
  return useQuery({
    queryKey: stockKeys.items(filter),
    queryFn: () => stockApi.listItems(filter),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useStockItem(id: string | null) {
  return useQuery({
    queryKey: stockKeys.item(id ?? ""),
    queryFn: () => stockApi.getItem(id!),
    enabled: Boolean(id),
  });
}

export function useStockMovements(filter: MovementFilter, enabled = true) {
  return useQuery({
    queryKey: stockKeys.movements(filter),
    queryFn: () => stockApi.listMovements(filter),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useStockCategories() {
  return useQuery({ queryKey: stockKeys.categories, queryFn: () => stockApi.categories(), staleTime: 60_000 });
}

export function useStockMutations() {
  const invalidate = useInvalidateStock();
  const create = useMutation({
    mutationFn: (payload: StockItemPayload) => stockApi.createItem(payload),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof stockApi.updateItem>[1] }) =>
      stockApi.updateItem(id, payload),
    onSuccess: invalidate,
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => stockApi.setActive(id, active),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { type: ManualMovementType; quantity: number; reason?: string; date?: string };
    }) => stockApi.recordMovement(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, deleteExpenses }: { id: string; deleteExpenses: boolean }) =>
      stockApi.deleteItem(id, deleteExpenses),
    onSuccess: invalidate,
  });
  return { create, update, setActive, move, remove };
}
