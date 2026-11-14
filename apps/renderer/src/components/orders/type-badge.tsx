import { Badge } from "@/components/ui";
import { ORDER_TYPE_LABELS, type OrderType } from "@fuego/shared";

export function TypeBadge({ orderType }: { orderType: OrderType }) {
  const label = ORDER_TYPE_LABELS[orderType] || orderType;
  const tone = orderType === "online" ? "info" : "neutral";

  return <Badge tone={tone}>{label}</Badge>;
}
