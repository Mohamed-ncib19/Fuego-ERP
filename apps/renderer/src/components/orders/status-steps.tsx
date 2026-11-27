import { Check } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { Banner } from "@astryxdesign/core/Banner";
import { Icon } from "@astryxdesign/core/Icon";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@fuego/shared";

const STEPS: OrderStatus[] = ["pending", "confirmed", "in_progress", "ready", "delivered"];

/**
 * Where the order stands in its workflow, at a glance: done steps are
 * ticked in gold, the current one is highlighted, the rest are muted.
 * On phones only the current step keeps its label, so the bar never scrolls.
 */
export function StatusSteps({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return <Banner status="error" title="Commande annulée" />;
  }

  const current = STEPS.indexOf(status);
  return (
    <Card padding={0}>
      <ol className="flex items-center px-4 py-3" aria-label="Avancement de la commande">
        {STEPS.map((step, index) => {
          const done = index < current || status === "delivered";
          const active = index === current && status !== "delivered";
          // The step a phone keeps labelled: the current one, or the last once delivered.
          const labelled = active || (status === "delivered" && step === "delivered");
          return (
            <li
              key={step}
              className="flex flex-1 items-center last:flex-none"
              aria-current={active ? "step" : undefined}
            >
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
                  {done ? <Icon icon={Check} size="sm" /> : index + 1}
                </span>
                <span
                  className={`whitespace-nowrap text-sm ${
                    active
                      ? "font-semibold text-primary"
                      : `${labelled ? "" : "hidden sm:inline"} ${done ? "text-text-primary" : "text-text-secondary"}`
                  }`}
                >
                  {ORDER_STATUS_LABELS[step]}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <span
                  className={`mx-2 h-px flex-1 sm:mx-3 ${index < current ? "bg-primary" : "bg-border"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
