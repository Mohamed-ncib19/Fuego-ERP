import { Badge } from "@astryxdesign/core/Badge";
import { ORDER_TYPE_LABELS, type OrderType } from "@fuego/shared";

export function TypeBadge({ orderType }: { orderType: OrderType }) {
  return (
    <Badge
      label={ORDER_TYPE_LABELS[orderType] || orderType}
      variant={orderType === "online" ? "info" : "neutral"}
    />
  );
}
