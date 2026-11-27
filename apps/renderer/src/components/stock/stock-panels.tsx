import { useState } from "react";
import type { ManualMovementType, StockItem, StockItemKind } from "@fuego/shared";
import { ConfirmDialog } from "@/components/ui";
import { useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { formatQty } from "@/lib/format";
import { ItemDrawer } from "./item-drawer";
import { ItemFormModal } from "./item-form-modal";
import { MovementModal } from "./movement-modal";

/**
 * Overlay state shared by both stock pages: item panel, movement modal,
 * create/edit form and archive confirmation. Pages call the returned
 * openers and render `panels` once.
 */
export function useStockPanels({ isAdmin, defaultKind }: { isAdmin: boolean; defaultKind?: StockItemKind }) {
  const toast = useToast();
  const { setActive } = useStockMutations();
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ item: StockItem; type: ManualMovementType } | null>(null);
  const [form, setForm] = useState<{ item: StockItem | null } | null>(null);
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

  const panels = (
    <>
      <ItemDrawer
        itemId={drawerId}
        onClose={() => setDrawerId(null)}
        isAdmin={isAdmin}
        onMove={(item, type) => setMoving({ item, type })}
        onEdit={(item) => setForm({ item })}
        onToggleActive={toggleActive}
      />
      <MovementModal
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        item={moving?.item ?? null}
        initialType={moving?.type}
        isAdmin={isAdmin}
      />
      <ItemFormModal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        item={form?.item}
        defaultKind={defaultKind}
      />
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
        title="Archiver l'article"
        message={
          archiving
            ? `« ${archiving.name} » (${formatQty(archiving.quantity, archiving.unit)} en stock) ne sera plus proposé dans les dépenses ni les mouvements. Son historique est conservé et il peut être réactivé.`
            : ""
        }
        confirmLabel="Archiver"
        danger
        loading={setActive.isPending}
      />
    </>
  );

  return {
    panels,
    openItem: (item: StockItem | string) => setDrawerId(typeof item === "string" ? item : item.id),
    openMove: (item: StockItem, type: ManualMovementType) => setMoving({ item, type }),
    openCreate: () => setForm({ item: null }),
    openEdit: (item: StockItem) => setForm({ item }),
  };
}
