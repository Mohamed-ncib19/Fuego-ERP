import { Receipt } from "lucide-react";
import { STOCK_MOVEMENT_LABELS, type StockMovement, type StockMovementKind } from "@fuego/shared";
import { formatDate, formatDateTime, formatMillimes, formatQty, formatSignedQty } from "@/lib/format";

const KIND_TONE: Record<StockMovementKind, string> = {
  initial: "text-text-secondary",
  purchase: "text-primary",
  purchase_correction: "text-primary",
  purchase_reversal: "text-danger",
  entry: "text-success",
  exit: "text-text-primary",
  adjustment: "text-info",
};

function KindLabel({ m }: { m: StockMovement }) {
  const fromExpense = m.kind.startsWith("purchase");
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${KIND_TONE[m.kind]}`}>
      {fromExpense && <Receipt className="h-3.5 w-3.5" aria-hidden="true" />}
      {STOCK_MOVEMENT_LABELS[m.kind]}
    </span>
  );
}

function Qty({ m }: { m: StockMovement }) {
  return (
    <span className={`font-semibold tabular-nums ${m.quantity > 0 ? "text-success" : "text-danger"}`}>
      {formatSignedQty(m.quantity, m.item_unit)}
    </span>
  );
}

/** Full ledger table (Stock → Mouvements). Rows with dividers, no cards. */
export function MovementsTable({
  movements,
  onOpenItem,
}: {
  movements: StockMovement[];
  onOpenItem?: (itemId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase text-text-secondary">
          <tr>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Article</th>
            <th className="px-4 py-3 font-medium">Mouvement</th>
            <th className="px-4 py-3 text-right font-medium">Quantité</th>
            <th className="px-4 py-3 text-right font-medium">Stock après</th>
            <th className="px-4 py-3 font-medium">Motif</th>
            <th className="px-4 py-3 font-medium">Par</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {movements.map((m) => (
            <tr key={m.id} className="transition-colors hover:bg-surface-2/50">
              <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                <span className="block text-text-primary">{formatDate(m.date)}</span>
                <span className="text-[11px]">{formatDateTime(m.created_at).split(" ")[1]}</span>
              </td>
              <td className="px-4 py-3">
                {onOpenItem ? (
                  <button
                    onClick={() => onOpenItem(m.stock_item_id)}
                    className="font-medium text-text-primary hover:text-primary hover:underline"
                  >
                    {m.item_name}
                  </button>
                ) : (
                  <span className="font-medium text-text-primary">{m.item_name}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <KindLabel m={m} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <Qty m={m} />
                {m.unit_cost !== null && (
                  <span className="block text-[11px] tabular-nums text-text-secondary">
                    {formatMillimes(m.unit_cost)} / u.
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-text-secondary">
                {m.balance_after !== undefined ? formatQty(m.balance_after, m.item_unit) : "—"}
              </td>
              <td className="max-w-[260px] px-4 py-3 text-text-secondary">
                <span className="line-clamp-2">{m.reason || "—"}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">{m.recorded_by_label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Compact timeline for the item drawer — one item, so no item column. */
export function MovementsTimeline({ movements }: { movements: StockMovement[] }) {
  return (
    <ol className="divide-y divide-border">
      {movements.map((m) => (
        <li key={m.id} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <KindLabel m={m} />
            {m.reason && <p className="mt-0.5 truncate text-sm text-text-primary">{m.reason}</p>}
            <p className="text-[11px] text-text-secondary">
              {formatDate(m.date)} · {m.recorded_by_label}
              {m.unit_cost !== null && ` · ${formatMillimes(m.unit_cost)} / u.`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Qty m={m} />
            {m.balance_after !== undefined && (
              <p className="text-[11px] tabular-nums text-text-secondary">
                → {formatQty(m.balance_after, m.item_unit)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
