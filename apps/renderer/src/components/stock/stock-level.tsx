import { STOCK_LEVEL_LABELS, type StockItem, type StockLevel } from "@fuego/shared";
import { StatusDot } from "@/components/ui";
import { formatQty } from "@/lib/format";

const LEVEL_TONE: Record<StockLevel, "success" | "warning" | "danger"> = {
  ok: "success",
  low: "warning",
  out: "danger",
};

export function StockLevelDot({ level }: { level: StockLevel }) {
  return <StatusDot tone={LEVEL_TONE[level]}>{STOCK_LEVEL_LABELS[level]}</StatusDot>;
}

/**
 * The stock gauge: current quantity as a bar, the minimum threshold as a
 * tick. Low stock reads from the fill reaching the tick, not from a number.
 * The scale is twice the threshold (or the quantity, if higher) so a healthy
 * item sits comfortably past the tick.
 */
export function StockGauge({
  item,
  className = "",
}: {
  item: Pick<StockItem, "quantity" | "min_threshold" | "level" | "unit">;
  className?: string;
}) {
  const max = Math.max(item.quantity, item.min_threshold * 2, 1);
  const fill = Math.max(0, Math.min(100, (item.quantity / max) * 100));
  const tick = item.min_threshold > 0 ? (item.min_threshold / max) * 100 : null;
  const color =
    item.level === "out" ? "bg-danger" : item.level === "low" ? "bg-warning" : "bg-success/80";

  return (
    <div
      className={`relative h-1.5 w-full rounded-full bg-border/60 ${className}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, item.quantity)}
      aria-label={
        tick !== null
          ? `${formatQty(item.quantity, item.unit)} sur un seuil de ${formatQty(item.min_threshold, item.unit)}`
          : formatQty(item.quantity, item.unit)
      }
    >
      <div className={`h-full rounded-full transition-[width] ${color}`} style={{ width: `${fill}%` }} />
      {tick !== null && (
        <span
          className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-text-primary/70"
          style={{ left: `calc(${tick}% - 1px)` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
