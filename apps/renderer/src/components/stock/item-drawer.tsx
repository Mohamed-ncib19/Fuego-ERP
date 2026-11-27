import type { ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, ShoppingCart } from "lucide-react";
import {
  STOCK_MOVEMENT_LABELS,
  STOCK_UNIT_LABELS,
  type ManualMovementType,
  type StockItem,
} from "@fuego/shared";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Banner } from "@astryxdesign/core/Banner";
import { Button, Drawer, ErrorState, MoreMenu, Skeleton } from "@/components/ui";
import { useStockItem, useStockMovements } from "@/hooks/use-stock";
import { formatDate, formatMillimes, formatQty, formatSignedQty } from "@/lib/format";
import { StockGauge, StockLevelDot } from "./stock-level";

/**
 * One material at a glance: how much is left, what to do next, and the
 * history that explains the number.
 */
export function ItemDrawer({
  itemId,
  onClose,
  isAdmin,
  onBuy,
  onMove,
  onEdit,
  onToggleActive,
}: {
  itemId: string | null;
  onClose: () => void;
  isAdmin: boolean;
  onBuy: (item: StockItem) => void;
  onMove: (item: StockItem, type: ManualMovementType) => void;
  onEdit: (item: StockItem) => void;
  onToggleActive: (item: StockItem) => void;
}) {
  const itemQ = useStockItem(itemId);
  const historyQ = useStockMovements({ item_id: itemId ?? undefined, limit: 50 }, Boolean(itemId));
  const item = itemQ.data;

  return (
    <Drawer
      open={Boolean(itemId)}
      onClose={onClose}
      title={item?.name ?? "Article"}
      subtitle={item?.category ?? undefined}
      width={560}
      footer={
        item ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => onEdit(item)}>
              Modifier
            </Button>
            {isAdmin && (
              <MoreMenu
                placement="up"
                items={[
                  {
                    label: item.is_active ? "Archiver" : "Réactiver",
                    danger: item.is_active,
                    hint: item.is_active ? "Masqué des listes, historique conservé" : undefined,
                    onClick: () => onToggleActive(item),
                  },
                ]}
              />
            )}
          </div>
        ) : undefined
      }
    >
      {itemQ.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton height={40} width="50%" />
          <Skeleton height={8} />
          <Skeleton height={120} />
        </div>
      ) : itemQ.isError || !item ? (
        <ErrorState message="Article introuvable" onRetry={() => void itemQ.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          {!item.is_active && (
            <Banner
              status="warning"
              title="Article archivé"
              description="Il n'est plus proposé dans les dépenses ni les mouvements."
            />
          )}

          <section className="flex flex-col gap-3" aria-label="Quantité en stock">
            <div className="flex items-end justify-between gap-3">
              <div>
                <Text type="supporting" color="secondary" display="block">
                  En stock
                </Text>
                <span className="text-[32px] font-semibold leading-tight tabular-nums">
                  {formatQty(item.quantity, item.unit)}
                </span>
              </div>
              <StockLevelDot level={item.level} />
            </div>
            <StockGauge item={item} />
            {item.min_threshold > 0 && (
              <Text type="supporting" color="secondary">
                Alerte à {formatQty(item.min_threshold, item.unit)}
              </Text>
            )}
          </section>

          {item.is_active && (
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Actions">
              <ActionTile icon={ShoppingCart} label="Acheter" primary onClick={() => onBuy(item)} />
              <ActionTile icon={ArrowUpFromLine} label="Utiliser" onClick={() => onMove(item, "exit")} />
              <ActionTile icon={ArrowDownToLine} label="Ajouter" onClick={() => onMove(item, "entry")} />
              <ActionTile
                icon={ClipboardCheck}
                label="Compter"
                disabled={!isAdmin}
                onClick={() => onMove(item, "count")}
              />
            </section>
          )}

          <MetadataList columns={2} label={{ position: "top" }}>
            <MetadataListItem label="Unité">{STOCK_UNIT_LABELS[item.unit]}</MetadataListItem>
            <MetadataListItem label="Dernier prix d'achat">
              {item.last_unit_cost !== null
                ? `${formatMillimes(item.last_unit_cost)} / ${STOCK_UNIT_LABELS[item.unit]}`
                : "Jamais acheté"}
            </MetadataListItem>
            <MetadataListItem label="Valeur estimée">
              {item.last_unit_cost !== null
                ? formatMillimes(Math.round((Math.max(0, item.quantity) * item.last_unit_cost) / 1000))
                : "—"}
            </MetadataListItem>
            <MetadataListItem label="Ajouté le">{formatDate(item.created_at)}</MetadataListItem>
            {item.note ? <MetadataListItem label="Note">{item.note}</MetadataListItem> : null}
          </MetadataList>

          <section className="flex flex-col gap-2" aria-label="Historique">
            <Heading level={3}>Historique</Heading>
            {historyQ.isLoading ? (
              <Skeleton height={96} />
            ) : (historyQ.data?.data.length ?? 0) === 0 ? (
              <Text color="secondary">Aucun mouvement pour l'instant.</Text>
            ) : (
              <ul className="divide-y divide-border">
                {historyQ.data!.data.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Text weight="medium" display="block">
                        {STOCK_MOVEMENT_LABELS[m.kind]}
                      </Text>
                      <Text type="supporting" color="secondary" display="block" maxLines={1}>
                        {formatDate(m.date)} · {m.recorded_by_label}
                        {m.reason ? ` · ${m.reason}` : ""}
                      </Text>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`block font-medium tabular-nums ${m.quantity > 0 ? "text-success" : "text-danger"}`}
                      >
                        {formatSignedQty(m.quantity, m.item_unit)}
                      </span>
                      {m.balance_after !== undefined && (
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          → {formatQty(m.balance_after, m.item_unit)}
                        </Text>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function ActionTile({
  icon,
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: Parameters<typeof Icon>[0]["icon"];
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}): ReactNode {
  return (
    <Button
      variant={primary ? "primary" : "secondary"}
      icon={<Icon icon={icon} size="sm" />}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Réservé à l'administrateur" : undefined}
      className="w-full"
    >
      {label}
    </Button>
  );
}
