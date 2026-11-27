import { ArrowDownToLine, ArrowUpFromLine, ChevronRight } from "lucide-react";
import { STOCK_ITEM_KIND_LABELS, type ManualMovementType, type StockItem, type StockLevel } from "@fuego/shared";
import { formatDate, formatMillimes, formatQty } from "@/lib/format";
import { StockGauge, StockLevelDot } from "./stock-level";

export type ItemSort = "alert" | "name" | "quantity" | "recent";

const LEVEL_RANK: Record<StockLevel, number> = { out: 0, low: 1, ok: 2 };

export function sortItems(items: StockItem[], sort: ItemSort): StockItem[] {
  const out = [...items];
  const byName = (a: StockItem, b: StockItem) => a.name.localeCompare(b.name, "fr");
  if (sort === "alert") out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || byName(a, b));
  else if (sort === "quantity") out.sort((a, b) => a.quantity - b.quantity || byName(a, b));
  else if (sort === "recent")
    out.sort((a, b) => (b.last_movement_at ?? "").localeCompare(a.last_movement_at ?? "") || byName(a, b));
  else out.sort(byName);
  return out;
}

function QuickActions({
  item,
  onMove,
}: {
  item: StockItem;
  onMove: (item: StockItem, type: ManualMovementType) => void;
}) {
  const btn =
    "rounded-btn p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
  return (
    <div className="flex justify-end gap-1">
      <button
        className={btn}
        title="Sortie de stock"
        aria-label={`Sortie de stock — ${item.name}`}
        disabled={!item.is_active || item.quantity <= 0}
        onClick={(e) => {
          e.stopPropagation();
          onMove(item, "exit");
        }}
      >
        <ArrowUpFromLine className="h-4 w-4" />
      </button>
      <button
        className={btn}
        title="Entrée de stock"
        aria-label={`Entrée de stock — ${item.name}`}
        disabled={!item.is_active}
        onClick={(e) => {
          e.stopPropagation();
          onMove(item, "entry");
        }}
      >
        <ArrowDownToLine className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Inventory rows: a table from md up, stacked rows below. Clicking a row
 * opens the item panel; entry/exit are one click away on each row.
 */
export function ItemsTable({
  items,
  onOpen,
  onMove,
  showKind = true,
  showPrice = false,
}: {
  items: StockItem[];
  onOpen: (item: StockItem) => void;
  onMove: (item: StockItem, type: ManualMovementType) => void;
  showKind?: boolean;
  showPrice?: boolean;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Article</th>
              <th className="w-[28%] px-4 py-3 font-medium">Quantité disponible</th>
              <th className="px-4 py-3 text-right font-medium">Seuil</th>
              {showPrice && <th className="px-4 py-3 text-right font-medium">Dernier prix</th>}
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium">Dernier mouvement</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => onOpen(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(item);
                }}
                tabIndex={0}
                className={`cursor-pointer transition-colors hover:bg-surface-2/60 focus:bg-surface-2/60 focus:outline-none ${
                  item.is_active ? "" : "opacity-60"
                }`}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-text-primary">{item.name}</p>
                  <p className="text-xs text-text-secondary">
                    {[showKind ? STOCK_ITEM_KIND_LABELS[item.kind] : null, item.category, item.is_active ? null : "Archivé"]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p
                    className={`font-semibold tabular-nums ${
                      item.level === "out" ? "text-danger" : item.level === "low" ? "text-warning" : "text-text-primary"
                    }`}
                  >
                    {formatQty(item.quantity, item.unit)}
                  </p>
                  <StockGauge item={item} className="mt-1.5 max-w-[220px]" />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-text-secondary">
                  {item.min_threshold > 0 ? formatQty(item.min_threshold, item.unit) : "—"}
                </td>
                {showPrice && (
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-text-secondary">
                    {item.last_unit_cost !== null ? formatMillimes(item.last_unit_cost) : "—"}
                  </td>
                )}
                <td className="px-4 py-3">
                  <StockLevelDot level={item.level} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                  {item.last_movement_at ? formatDate(item.last_movement_at) : "—"}
                </td>
                <td className="px-4 py-3">
                  <QuickActions item={item} onMove={onMove} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Small screens: one stacked row per item. */}
      <ul className="divide-y divide-border md:hidden">
        {items.map((item) => (
          <li key={item.id} className={item.is_active ? "" : "opacity-60"}>
            <button
              onClick={() => onOpen(item)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-medium text-text-primary">{item.name}</p>
                  <p className="shrink-0 font-semibold tabular-nums text-text-primary">
                    {formatQty(item.quantity, item.unit)}
                  </p>
                </div>
                <StockGauge item={item} className="my-2" />
                <div className="flex items-center justify-between gap-3">
                  <StockLevelDot level={item.level} />
                  <span className="truncate text-xs text-text-secondary">
                    {item.min_threshold > 0 ? `Seuil ${formatQty(item.min_threshold, item.unit)}` : item.category ?? ""}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
