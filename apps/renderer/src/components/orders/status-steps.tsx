import { Check, XCircle } from "lucide-react";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@fuego/shared";

const STEPS: OrderStatus[] = ["pending", "confirmed", "in_progress", "ready", "delivered"];

/**
 * Where the order stands in its workflow, at a glance: done steps are
 * ticked in gold, the current one is highlighted, the rest are muted.
 */
export function StatusSteps({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-card border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
        <XCircle className="h-4 w-4" />
        <span>Commande annulée</span>
      </div>
    );
  }

  const current = STEPS.indexOf(status);
  return (
    <ol className="flex items-center rounded-card border border-border bg-surface px-4 py-3">
      {STEPS.map((step, index) => {
        const done = index < current || status === "delivered";
        const active = index === current && status !== "delivered";
        return (
          <li key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-primary text-neutral-950"
                    : active
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-text-secondary"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={`whitespace-nowrap text-sm ${
                  active
                    ? "font-semibold text-primary"
                    : done
                      ? "text-text-primary"
                      : "text-text-secondary"
                }`}
              >
                {ORDER_STATUS_LABELS[step]}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                className={`mx-3 h-px flex-1 ${index < current ? "bg-primary" : "bg-border"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
