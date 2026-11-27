import { useState } from "react";
import type { ManualMovementType, StockItem } from "@fuego/shared";
import { ConfirmDialog } from "@/components/ui";
import { ExpenseFormModal } from "@/components/expenses/expense-form-modal";
import { useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { formatQty } from "@/lib/format";
import { ItemDrawer } from "./item-drawer";
import { MaterialDialog } from "./material-dialog";
import { MovementDialog } from "./movement-dialog";

/**
 * Every stock overlay in one place: item panel, purchase (a dépense with the
 * item pre-filled), movement, create/edit and archive confirmation. The page
 * calls the openers and renders `overlays` once.
 */
export function useStockActions({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const { setActive } = useStockMutations();
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ item: StockItem; type: ManualMovementType } | null>(null);
  const [form, setForm] = useState<{ item: StockItem | null } | null>(null);
  const [buying, setBuying] = useState<StockItem | null>(null);
  const [archiving, setArchiving] = useState<StockItem | null>(null);

  const toggleActive = (item: StockItem) => {
    if (item.is_active) {
      setArchiving(item);
      return;
    }
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
        onToggleActive={toggleActive}
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
      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (!archiving) return;
          setActive.mutate(
            { id: archiving.id, active: false },
            {
              onSuccess: () => {
                toast.success(`« ${archiving.name} » archivé`);
                setArchiving(null);
              },
              onError: (e: Error) => toast.error(e.message),
            },
          );
        }}
        title={`Archiver « ${archiving?.name ?? ""} » ?`}
        message={
          archiving
            ? `Il reste ${formatQty(archiving.quantity, archiving.unit)} en stock. L'article ne sera plus proposé dans les dépenses ni les mouvements ; son historique est conservé et vous pourrez le réactiver.`
            : ""
        }
        confirmLabel="Archiver"
        danger
        loading={setActive.isPending}
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
  };
}
