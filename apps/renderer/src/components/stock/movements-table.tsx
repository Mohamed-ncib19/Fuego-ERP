import { useMemo } from "react";
import { STOCK_MOVEMENT_LABELS, type StockMovement, type StockMovementKind } from "@fuego/shared";
import { Table, pixel, type TableColumn } from "@astryxdesign/core/Table";
import { Badge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import { EmptyState } from "@/components/ui";
import { formatDate, formatMillimes, formatQty, formatSignedQty } from "@/lib/format";

type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral";

const KIND_BADGE: Record<StockMovementKind, BadgeVariant> = {
  initial: "neutral",
  purchase: "success",
  purchase_correction: "info",
  purchase_reversal: "warning",
  entry: "success",
  exit: "error",
  adjustment: "info",
};

type Row = StockMovement & Record<string, unknown>;

/**
 * Stock ledger on Astryx Table. `showItem` adds the article column (global
 * history); inside an item's panel it is implied.
 */
export function MovementsTable({
  movements,
  showItem = true,
  onOpenItem,
  emptyTitle = "Aucun mouvement",
}: {
  movements: StockMovement[];
  showItem?: boolean;
  onOpenItem?: (id: string) => void;
  emptyTitle?: string;
}) {
  const columns = useMemo<TableColumn<Row>[]>(() => {
    const cols: TableColumn<Row>[] = [
      {
        key: "date",
        header: "Date",
        width: pixel(120),
        renderCell: (m) => <span className="tabular-nums">{formatDate(m.date)}</span>,
      },
    ];
    if (showItem) {
      cols.push({
        key: "item_name",
        header: "Article",
        renderCell: (m) =>
          onOpenItem ? (
            <button
              type="button"
              className="text-left font-medium text-text-primary hover:underline"
              onClick={() => onOpenItem(m.stock_item_id)}
            >
              {m.item_name}
            </button>
          ) : (
            m.item_name
          ),
      });
    }
    cols.push(
      {
        key: "kind",
        header: "Mouvement",
        width: pixel(170),
        renderCell: (m) => (
          <span className="flex flex-col items-start gap-0.5">
            <Badge variant={KIND_BADGE[m.kind]} label={STOCK_MOVEMENT_LABELS[m.kind]} />
            {m.reason && (
              <Text type="supporting" color="secondary" maxLines={1}>
                {m.reason}
              </Text>
            )}
          </span>
        ),
      },
      {
        key: "quantity",
        header: "Quantité",
        align: "end",
        width: pixel(130),
        renderCell: (m) => (
          <span
            className={`font-medium tabular-nums ${m.quantity > 0 ? "text-success" : m.quantity < 0 ? "text-danger" : ""}`}
          >
            {formatSignedQty(m.quantity, m.item_unit)}
          </span>
        ),
      },
      {
        key: "balance_after",
        header: "Stock après",
        align: "end",
        width: pixel(120),
        renderCell: (m) =>
          m.balance_after === undefined ? "—" : (
            <span className="tabular-nums">{formatQty(m.balance_after, m.item_unit)}</span>
          ),
      },
      {
        key: "unit_cost",
        header: "Prix unitaire",
        align: "end",
        width: pixel(130),
        renderCell: (m) =>
          m.unit_cost === null ? (
            <span className="text-text-secondary">—</span>
          ) : (
            <span className="tabular-nums">{formatMillimes(m.unit_cost)}</span>
          ),
      },
      {
        key: "recorded_by_label",
        header: "Par",
        width: pixel(140),
        renderCell: (m) => (
          <Text color="secondary" maxLines={1}>
            {m.recorded_by_label}
          </Text>
        ),
      },
    );
    return cols;
  }, [showItem, onOpenItem]);

  return (
    <div className="overflow-x-auto">
      <Table<Row>
        data={movements as Row[]}
        columns={columns}
        idKey="id"
        density="compact"
        hasHover
        emptyState={<EmptyState title={emptyTitle} compact />}
      />
    </div>
  );
}
