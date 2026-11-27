import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Phone, Check, Play, CheckCircle2, Truck, AlertCircle } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { formatMillimes, formatDate } from "@/lib/format";
import { TypeBadge } from "./type-badge";
import { formatPhone, type OrderSummary } from "@fuego/shared";

interface OrderCardProps {
  order: OrderSummary;
  onAdvance?: (order: OrderSummary) => void;
  advanceLoading?: boolean;
}

/** Money left to pay: warning while due, info when overpaid, success when settled. */
function resteClass(reste: number): string {
  return reste > 0 ? "text-warning" : reste < 0 ? "text-info" : "text-success";
}

export function OrderCard({ order, onAdvance, advanceLoading = false }: OrderCardProps) {
  const navigate = useNavigate();
  const isIncomplete = order.items_count === 0 && order.status === "pending";
  const canDeliver = order.reste <= 0;
  const open = () => navigate(`/commandes/${order.id}`);

  const advance = (e: MouseEvent) => {
    e.stopPropagation();
    onAdvance?.(order);
  };

  // The one next step for this order, sized to the card.
  const step = (label: string, icon: ReactNode, opts: { disabled?: boolean; tooltip?: string; secondary?: boolean } = {}) => (
    <Button
      label={label}
      size="sm"
      width="100%"
      variant={opts.secondary ? "secondary" : "primary"}
      icon={icon}
      isDisabled={opts.disabled || advanceLoading}
      tooltip={opts.tooltip}
      onClick={advance}
    />
  );

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Ouvrir la commande ${order.ticket_no}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      className="cursor-pointer rounded-card outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card padding={4}>
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs font-bold text-primary">{order.ticket_no}</span>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {isIncomplete && (
              <Badge variant="error" label="Incomplète" icon={<Icon icon={AlertCircle} size="sm" />} />
            )}
            <TypeBadge orderType={order.order_type} />
          </div>
        </div>

        <div className="mt-2.5 min-w-0">
          <Text weight="semibold" display="block" maxLines={1}>
            {order.customer_name || "Sans nom (Brouillon)"}
          </Text>
          {order.customer_phone && (
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
              <Icon icon={Phone} size="xsm" />
              <span>{formatPhone(order.customer_phone)}</span>
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
          <span>
            <span className="text-text-secondary">Total : </span>
            <span className="font-semibold tabular-nums text-text-primary">
              {formatMillimes(order.grand_total)}
            </span>
          </span>
          <span>
            <span className="text-text-secondary">Reste : </span>
            <span className={`font-semibold tabular-nums ${resteClass(order.reste)}`}>
              {formatMillimes(order.reste)}
            </span>
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-text-secondary">
          <span className="flex items-center gap-1">
            <Icon icon={Calendar} size="xsm" />
            {order.due_date ? formatDate(order.due_date) : formatDate(order.created_at)}
          </span>
          <span>{order.items_count} art.</span>
        </div>

        {onAdvance && order.status !== "delivered" && order.status !== "cancelled" && (
          <div className="mt-3 border-t border-border pt-2.5">
            {order.status === "pending" &&
              step("Confirmer", <Icon icon={Check} size="sm" />, {
                disabled: isIncomplete,
                tooltip: isIncomplete ? "Ajoutez au moins un article avant de confirmer" : "Confirmer la commande",
              })}
            {order.status === "confirmed" && step("Démarrer", <Icon icon={Play} size="sm" />)}
            {order.status === "in_progress" && step("Prête", <Icon icon={CheckCircle2} size="sm" />)}
            {order.status === "ready" &&
              step(canDeliver ? "Livrer" : "Solde requis", <Icon icon={Truck} size="sm" />, {
                disabled: !canDeliver,
                secondary: !canDeliver,
                tooltip: canDeliver ? "Livrer la commande" : "Reste à payer non soldé",
              })}
          </div>
        )}
      </Card>
    </div>
  );
}
