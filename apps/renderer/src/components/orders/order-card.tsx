import { useNavigate } from "react-router-dom";
import { Calendar, User, Phone, Check, Play, CheckCircle2, Truck, AlertCircle } from "lucide-react";
import { formatMillimes, formatDate } from "@/lib/format";
import { Badge, Button } from "@/components/ui";
import { TypeBadge } from "./type-badge";
import type { OrderSummary } from "@fuego/shared";

interface OrderCardProps {
  order: OrderSummary;
  onAdvance?: (order: OrderSummary) => void;
  advanceLoading?: boolean;
}

export function OrderCard({ order, onAdvance, advanceLoading = false }: OrderCardProps) {
  const navigate = useNavigate();
  const isIncomplete = order.items_count === 0 && order.status === "pending";
  const canDeliver = order.reste <= 0;

  const handleAdvance = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAdvance) {
      onAdvance(order);
    }
  };

  return (
    <div
      onClick={() => navigate(`/commandes/${order.id}`)}
      className="cursor-pointer rounded-card border border-border bg-surface p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-bold text-primary">{order.ticket_no}</span>
        <div className="flex items-center gap-1.5">
          {isIncomplete && (
            <Badge tone="danger">
              <span className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Incomplète
              </span>
            </Badge>
          )}
          <TypeBadge orderType={order.order_type} />
        </div>
      </div>

      <div className="mt-2.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <User className="h-3.5 w-3.5 text-text-secondary" />
          <span className="truncate">{order.customer_name || "Sans nom (Brouillon)"}</span>
        </p>
        {order.customer_phone && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
            <Phone className="h-3 w-3" />
            <span>{order.customer_phone}</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-xs">
        <div>
          <span className="text-text-secondary">Total: </span>
          <span className="font-semibold text-text-primary">{formatMillimes(order.grand_total)}</span>
        </div>
        <div>
          <span className="text-text-secondary">Reste: </span>
          <span className={`font-semibold ${order.reste > 0 ? "text-warning" : order.reste < 0 ? "text-info" : "text-success"}`}>
            {formatMillimes(order.reste)}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {order.due_date ? formatDate(order.due_date) : formatDate(order.created_at)}
        </span>
        <span>{order.items_count} art.</span>
      </div>

      {onAdvance && (
        <div className="mt-3 border-t border-border/50 pt-2.5">
          {order.status === "pending" && (
            <Button
              variant="primary"
              className="w-full py-1 text-xs"
              disabled={isIncomplete || advanceLoading}
              onClick={handleAdvance}
              title={isIncomplete ? "Ajoutez au moins un article avant de confirmer" : "Confirmer la commande"}
            >
              <Check className="h-3.5 w-3.5" />
              <span>Confirmer</span>
            </Button>
          )}
          {order.status === "confirmed" && (
            <Button
              variant="primary"
              className="w-full py-1 text-xs"
              disabled={advanceLoading}
              onClick={handleAdvance}
            >
              <Play className="h-3.5 w-3.5" />
              <span>Démarrer</span>
            </Button>
          )}
          {order.status === "in_progress" && (
            <Button
              variant="primary"
              className="w-full py-1 text-xs"
              disabled={advanceLoading}
              onClick={handleAdvance}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Prête</span>
            </Button>
          )}
          {order.status === "ready" && (
            <Button
              variant={canDeliver ? "primary" : "secondary"}
              className="w-full py-1 text-xs"
              disabled={!canDeliver || advanceLoading}
              onClick={handleAdvance}
              title={canDeliver ? "Livrer la commande" : "Reste à payer non soldé"}
            >
              <Truck className="h-3.5 w-3.5" />
              <span>{canDeliver ? "Livrer" : "Solde requis"}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
