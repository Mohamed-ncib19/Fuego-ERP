import { useState } from "react";
import type { ManualMovementType, StockItem } from "@fuego/shared";
import { ExpenseFormModal } from "@/components/expenses/expense-form-modal";
import { useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { ItemDrawer } from "./item-drawer";
import { MaterialDialog } from "./material-dialog";
import { MovementDialog } from "./movement-dialog";
import { DeleteMaterialDialog } from "./delete-material-dialog";

/**
 * Every stock overlay in one place: item panel, purchase (a dépense with the
 * item pre-filled), movement, create/edit and permanent delete. The page
 * calls the openers and renders `overlays` once.
 */
export function useStockActions({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const { setActive } = useStockMutations();
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ item: StockItem; type: ManualMovementType } | null>(null);
  const [form, setForm] = useState<{ item: StockItem | null } | null>(null);
  const [buying, setBuying] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState<StockItem | null>(null);

  /** Only for items archived before delete existed: bring them back. */
  const restore = (item: StockItem) => {
    setActive.mutate(
      { id: item.id, active: true },
      {
        onSuccess: () => toast.success(`« ${item.name} » réactivé`),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const overlays = (
    <>
      <ItemDrawer
        itemId={drawerId}
        onClose={() => setDrawerId(null)}
        isAdmin={isAdmin}
        onBuy={setBuying}
        onMove={(item, type) => setMoving({ item, type })}
        onEdit={(item) => setForm({ item })}
        onRestore={restore}
        onDelete={setDeleting}
      />
      <MovementDialog
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        item={moving?.item ?? null}
        initialType={moving?.type}
        isAdmin={isAdmin}
      />
      <MaterialDialog open={Boolean(form)} onClose={() => setForm(null)} item={form?.item} />
      <ExpenseFormModal open={Boolean(buying)} onClose={() => setBuying(null)} presetItem={buying} />
      <DeleteMaterialDialog
        item={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => setDrawerId((id) => (id === deleting?.id ? null : id))}
      />
    </>
  );

  return {
    overlays,
    openItem: (item: StockItem | string) => setDrawerId(typeof item === "string" ? item : item.id),
    openBuy: (item: StockItem) => setBuying(item),
    openMove: (item: StockItem, type: ManualMovementType) => setMoving({ item, type }),
    openCreate: () => setForm({ item: null }),
    openEdit: (item: StockItem) => setForm({ item }),
    openDelete: (item: StockItem) => setDeleting(item),
    restore,
  };
}
