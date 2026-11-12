import { ClipboardList, Wallet, Users as UsersIcon, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/hooks/use-auth-store";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, Badge } from "@/components/ui";
import { roleLabel } from "@/lib/format";
import { useSettings } from "@/hooks/use-queries";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: settings } = useSettings();

  const firstName = user?.full_name?.split(" ")[0] ?? "";

  return (
    <DashboardShell
      title={`Bonjour ${firstName} 👋`}
      subtitle={settings?.business_name ?? ""}
    >
      <div className="space-y-6">
        {/* Phase roadmap — the Phase 0 dashboard is intentionally light; real
            KPIs land with orders (Phase 1) and finance (Phase 2). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ComingCard
            icon={<ClipboardList className="h-5 w-5" />}
            title="Commandes"
            description="Créer des commandes avec description, avance, confirmation, statut local/online et tickets."
            phase="Phase 1"
          />
          <ComingCard
            icon={<Wallet className="h-5 w-5" />}
            title="Finances"
            description="Revenus, dépenses, avances encaissées et bénéfices — tableau de bord complet."
            phase="Phase 2"
          />
          <ComingCard
            icon={<UsersIcon className="h-5 w-5" />}
            title="Utilisateurs"
            description="Gérez les comptes employés et leurs accès depuis Paramètres → Utilisateurs."
            phase="Prêt"
            ready
            to="/settings/users"
          />
          <ComingCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Sécurité"
            description="Sessions protégées (JWT), journal d'audit et révocable à tout moment."
            phase="Actif"
            ready
            to="/profile"
          />
        </div>

        <Card className="p-5">
          <h2 className="text-h3 font-semibold text-text-primary">Votre compte</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-text-secondary">Nom</p>
              <p className="font-medium text-text-primary">{user?.full_name}</p>
            </div>
            <div>
              <p className="text-text-secondary">E-mail</p>
              <p className="font-medium text-text-primary">{user?.email}</p>
            </div>
            <div>
              <p className="text-text-secondary">Rôle</p>
              <p className="mt-1 font-medium text-text-primary">
                <Badge tone={user?.role === "super_admin" ? "primary" : "info"}>
                  {user && roleLabel[user.role]}
                </Badge>
              </p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}

function ComingCard({
  icon,
  title,
  description,
  phase,
  ready = false,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
  ready?: boolean;
  to?: string;
}) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-card bg-primary/10 text-primary">
          {icon}
        </div>
        <Badge tone={ready ? "success" : "neutral"}>{phase}</Badge>
      </div>
      <p className="text-h3 font-semibold text-text-primary">{title}</p>
      <p className="mt-1 flex-1 text-sm text-text-secondary">{description}</p>
      {ready && to && (
        <Link to={to} className="mt-3 text-sm font-medium text-primary hover:underline">
          Ouvrir →
        </Link>
      )}
    </Card>
  );
}
