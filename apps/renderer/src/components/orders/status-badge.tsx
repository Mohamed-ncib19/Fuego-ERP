import { Badge } from "@astryxdesign/core/Badge";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@fuego/shared";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "error" | "yellow";

/** One colour per workflow step; the label always says the status in words. */
const STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  pending: "neutral",
  confirmed: "info",
  in_progress: "yellow",
  ready: "warning",
  delivered: "success",
  cancelled: "error",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge
      label={ORDER_STATUS_LABELS[status] || status}
      variant={STATUS_VARIANT[status] || "neutral"}
    />
  );
}
