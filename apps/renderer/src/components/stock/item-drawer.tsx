import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, History, Pencil } from "lucide-react";
import {
  STOCK_ITEM_KIND_LABELS,
  STOCK_UNIT_NAMES,
  type ManualMovementType,
  type StockItem,
} from "@fuego/shared";
import { Button, Drawer, EmptyState, ErrorState, MoreMenu, Skeleton } from "@/components/ui";
import { useStockItem, useStockMovements } from "@/hooks/use-stock";
import { formatDateTime, formatMillimes, formatQty, lineTotalOf } from "@/lib/format";
import { StockGauge, StockLevelDot } from "./stock-level";
import { MovementsTimeline } from "./movements-list";

const PAGE = 20;

/** One item: quantity, gauge, facts, actions and its full movement history. */
export function ItemDrawer({
  itemId,
  onClose,
  isAdmin,
  onMove,
  onEdit,
  onToggleActive,
}: {
  itemId: string | null;
  onClose: () => void;
  isAdmin: boolean;
  onMove: (item: StockItem, type: ManualMovementType) => void;
  onEdit: (item: StockItem) => void;
  onToggleActive: (item: StockItem) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [itemId]);

  const itemQ = useStockItem(itemId);
  const movesQ = useStockMovements({ item_id: itemId ?? undefined, limit }, Boolean(itemId));
  const item = itemQ.data;

  return (
    <Drawer
      open={Boolean(itemId)}
      onClose={onClose}
      title={item?.name ?? "Article"}
      subtitle={
        item && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{STOCK_ITEM_KIND_LABELS[item.kind]}</span>
            {item.category && <span>· {item.category}</span>}
            {!item.is_active && <span className="text-warning">· Archivé</span>}
          </span>
        )
      }
      footer={
        item && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onMove(item, "exit")} disabled={!item.is_active || item.quantity <= 0}>
                <ArrowUpFromLine className="h-4 w-4" />
                Sortie
              </Button>
              <Button variant="secondary" onClick={() => onMove(item, "entry")} disabled={!item.is_active}>
                <ArrowDownToLine className="h-4 w-4" />
                Entrée
              </Button>
            </div>
            <MoreMenu
              placement="up"
              items={[
                { label: "Modifier l'article", icon: <Pencil className="h-4 w-4" />, onClick: () => onEdit(item) },
                ...(isAdmin
                  ? [
                      {
                        label: "Inventaire (corriger le stock)",
                        icon: <ClipboardCheck className="h-4 w-4" />,
                        onClick: () => onMove(item, "count"),
                        disabled: !item.is_active,
                      },
                      item.is_active
                        ? {
                            label: "Archiver",
                            icon: <Archive className="h-4 w-4" />,
                            onClick: () => onToggleActive(item),
                            danger: true,
                            hint: "L'historique est conservé",
                          }
                        : {
                            label: "Réactiver",
                            icon: <ArchiveRestore className="h-4 w-4" />,
                            onClick: () => onToggleActive(item),
                          },
                    ]
                  : []),
              ]}
            />
          </div>
        )
      }
    >
      {itemQ.isError ? (
        <ErrorState message={(itemQ.error as Error).message} onRetry={() => itemQ.refetch()} />
      ) : !item ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quantity first: the one number this panel exists for. */}
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-text-secondary">En stock</p>
                <p className="text-h1 font-bold tabular-nums text-text-primary">{formatQty(item.quantity, item.unit)}</p>
              </div>
              <StockLevelDot level={item.level} />
            </div>
            <StockGauge item={item} className="mt-3" />
            <p className="mt-2 text-xs text-text-secondary">
              {item.min_threshold > 0
                ? `Seuil d'alerte : ${formatQty(item.min_threshold, item.unit)}`
                : "Aucun seuil d'alerte défini"}
            </p>
          </section>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-btn border border-border bg-surface-2 p-4 text-sm">
            <div>
              <dt className="text-xs text-text-secondary">Unité</dt>
              <dd className="text-text-primary">{STOCK_UNIT_NAMES[item.unit]}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Dernier prix d'achat</dt>
              <dd className="tabular-nums text-text-primary">
                {item.last_unit_cost !== null ? `${formatMillimes(item.last_unit_cost)} / u.` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Valeur estimée</dt>
              <dd className="tabular-nums text-text-primary">
                {item.last_unit_cost !== null && item.quantity > 0
                  ? formatMillimes(lineTotalOf(item.quantity, item.last_unit_cost))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Dernier mouvement</dt>
              <dd className="text-text-primary">
                {item.last_movement_at ? formatDateTime(item.last_movement_at) : "—"}
              </dd>
            </div>
            {item.note && (
              <div className="col-span-2">
                <dt className="text-xs text-text-secondary">Note</dt>
                <dd className="text-text-primary">{item.note}</dd>
              </div>
            )}
          </dl>

          <section>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <History className="h-4 w-4 text-text-secondary" />
              Historique
              {movesQ.data && (
                <span className="font-normal text-text-secondary">({movesQ.data.meta.total})</span>
              )}
            </h3>
            {movesQ.isLoading ? (
              <div className="space-y-3 py-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !movesQ.data || movesQ.data.data.length === 0 ? (
              <EmptyState
                title="Aucun mouvement"
                description="Les achats (dépenses « Matières & Fournitures »), entrées et sorties apparaîtront ici."
              />
            ) : (
              <>
                <MovementsTimeline movements={movesQ.data.data} />
                {movesQ.data.meta.total > movesQ.data.data.length && (
                  <Button
                    variant="ghost"
                    className="mt-2 w-full"
                    loading={movesQ.isFetching}
                    onClick={() => setLimit((l) => l + PAGE)}
                  >
                    Afficher plus
                  </Button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
