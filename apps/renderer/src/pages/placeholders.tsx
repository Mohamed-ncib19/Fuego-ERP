import { ClipboardList, Wallet } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, Badge } from "@/components/ui";

/** Placeholders — the real screens arrive with Phase 1 (orders) and
 * Phase 2 (finance). Shown as disabled sidebar entries too. */
export function OrdersPlaceholderPage() {
  return (
    <DashboardShell
      title="Commandes"
      subtitle="Création, confirmation et suivi des commandes"
    >
      <Card className="p-8">
        <Placeholder icon={<ClipboardList className="h-10 w-10" />} phase="Phase 1" title="Bientôt disponible" description="Créez des commandes avec description, avance (avance), type local/online, statut de progression et tickets imprimables." />
      </Card>
    </DashboardShell>
  );
}

export function FinancesPlaceholderPage() {
  return (
    <DashboardShell title="Finances" subtitle="Revenus, dépenses et bénéfices">
      <Card className="p-8">
        <Placeholder icon={<Wallet className="h-10 w-10" />} phase="Phase 2" title="Bientôt disponible" description="Suivi complet des revenus (avances + soldes), des dépenses et du bénéfice, avec graphiques et export." />
      </Card>
    </DashboardShell>
  );
}

function Placeholder({
  icon,
  title,
  description,
  phase,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-3 text-primary">{icon}</div>
      <p className="text-h2 font-bold text-text-primary">{title}</p>
      <p className="mt-2 max-w-md text-sm text-text-secondary">{description}</p>
      <div className="mt-4">
        <Badge tone="primary">{phase}</Badge>
      </div>
    </div>
  );
}
