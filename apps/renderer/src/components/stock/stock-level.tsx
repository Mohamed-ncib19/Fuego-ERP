import { STOCK_LEVEL_LABELS, type StockItem, type StockLevel } from "@fuego/shared";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { StatusDot } from "@/components/ui";
import { formatQty } from "@/lib/format";

const LEVEL_TONE: Record<StockLevel, "success" | "warning" | "danger"> = {
  ok: "success",
  low: "warning",
  out: "danger",
};

const LEVEL_BAR: Record<StockLevel, "success" | "warning" | "error"> = {
  ok: "success",
  low: "warning",
  out: "error",
};

export function StockLevelDot({ level }: { level: StockLevel }) {
  return <StatusDot tone={LEVEL_TONE[level]}>{STOCK_LEVEL_LABELS[level]}</StatusDot>;
}

/**
 * Quantity against the alert threshold (Astryx ProgressBar, threshold drawn
 * as a mark). The scale is twice the threshold, or the quantity if higher,
 * so a healthy item sits clearly past the mark.
 */
export function StockGauge({
  item,
}: {
  item: Pick<StockItem, "quantity" | "min_threshold" | "level" | "unit" | "name">;
}) {
  const max = Math.max(item.quantity, item.min_threshold * 2, 1);
  const label =
    item.min_threshold > 0
      ? `${item.name} : ${formatQty(item.quantity, item.unit)} pour un seuil de ${formatQty(item.min_threshold, item.unit)}`
      : `${item.name} : ${formatQty(item.quantity, item.unit)}`;
  return (
    <ProgressBar
      label={label}
      isLabelHidden
      value={Math.max(0, item.quantity)}
      max={max}
      variant={LEVEL_BAR[item.level]}
      marks={item.min_threshold > 0 ? [{ value: item.min_threshold, label: "Seuil" }] : undefined}
    />
  );
}
