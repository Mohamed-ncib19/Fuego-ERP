import { Badge } from "@/components/ui";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@fuego/shared";

const STATUS_TONES: Record<OrderStatus, "neutral" | "success" | "danger" | "warning" | "info" | "primary"> = {
  pending: "neutral",
  confirmed: "info",
  in_progress: "primary",
  ready: "warning",
  delivered: "success",
  cancelled: "danger",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const label = ORDER_STATUS_LABELS[status] || status;
  const tone = STATUS_TONES[status] || "neutral";

  return <Badge tone={tone}>{label}</Badge>;
}
