import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Wallet,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  TrendingUp,
  Receipt,
  Eye,
} from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth-store";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, Badge, Button, PageLoader } from "@/components/ui";
import { formatMillimes, formatDate, roleLabel } from "@/lib/format";
import { useSettings } from "@/hooks/use-queries";
import { financeApi } from "@/lib/api/finance.api";
import { ordersApi } from "@/lib/api/orders.api";
import { StatusBadge } from "@/components/orders/status-badge";
import { TypeBadge } from "@/components/orders/type-badge";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: settings } = useSettings();
  const navigate = useNavigate();

  const firstName = user?.full_name?.split(" ")[0] ?? "";

  // Financial Stats Query
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["finance", "stats"],
    queryFn: () => financeApi.getStats(),
  });

  // Recent Orders Query
  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: () => ordersApi.list({ limit: 6, page: 1 }),
  });

  const activeOrdersCount = stats
    ? (stats.status_breakdown.pending || 0) +
      (stats.status_breakdown.confirmed || 0) +
      (stats.status_breakdown.in_progress || 0) +
      (stats.status_breakdown.ready || 0)
    : 0;

  return (
    <DashboardShell
      title={`Bonjour ${firstName} 👋`}
      subtitle={settings?.business_name ? `${settings.business_name} — Vue d'ensemble de l'activité` : "Vue d'ensemble de l'activité"}
    >
      <div className="space-y-6">
        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">Accès rapide :</span>
            <span className="hidden sm:inline">Gagnez du temps avec les raccourcis</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => navigate("/commandes/new")}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Nouvelle commande</span>
              <kbd className="hidden rounded bg-white/20 px-1 py-0.5 text-[10px] uppercase font-mono sm:inline">
                Ctrl+N
              </kbd>
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/finances")}
              className="gap-1.5"
            >
              <Receipt className="h-4 w-4" />
              <span>Finances & Dépenses</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/commandes")}
              className="gap-1.5"
            >
              <ClipboardList className="h-4 w-4" />
              <span>Toutes les commandes</span>
            </Button>
          </div>
        </div>

        {/* Live Operational KPI Cards */}
        {statsLoading ? (
          <PageLoader />
        ) : stats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Today Revenue */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Recettes aujourd'hui
                </span>
                <div className="rounded-full bg-success/10 p-2 text-success">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-success">
                +{formatMillimes(stats.today.revenue)}
              </div>
              <div className="mt-1 text-xs text-text-secondary">
                {stats.today.orders_count} commande(s) créée(s) ce jour
              </div>
            </Card>

            {/* Today Net Profit */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Bénéfice net aujourd'hui
                </span>
                <div
                  className={`rounded-full p-2 ${
                    stats.today.net_profit >= 0
                      ? "bg-primary/10 text-primary"
                      : "bg-danger/10 text-danger"
                  }`}
                >
                  <Wallet className="h-4 w-4" />
                </div>
              </div>
              <div
                className={`mt-2 text-2xl font-bold ${
                  stats.today.net_profit >= 0 ? "text-primary" : "text-danger"
                }`}
              >
                {formatMillimes(stats.today.net_profit)}
              </div>
              <div className="mt-1 text-xs text-text-secondary">
                Dépenses : -{formatMillimes(stats.today.expenses)}
              </div>
            </Card>

            {/* Active Orders */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Commandes en cours
                </span>
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <ClipboardList className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-text-primary">
                {activeOrdersCount}
              </div>
              <div className="mt-1 flex gap-2 text-xs text-text-secondary">
                <span>{stats.status_breakdown.ready || 0} prête(s)</span>
                <span>•</span>
                <span>{stats.status_breakdown.in_progress || 0} en atelier</span>
              </div>
            </Card>

            {/* Outstanding Balances */}
            <Card className="p-4 border-warning/40 bg-warning/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-warning-700 dark:text-warning">
                  Reste à encaisser
                </span>
                <div className="rounded-full bg-warning/15 p-2 text-warning-700 dark:text-warning">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-warning-800 dark:text-warning">
                {formatMillimes(stats.overall.outstanding_balances)}
              </div>
              <div className="mt-1 text-xs text-text-secondary">
                Créances actives sur commandes
              </div>
            </Card>
          </div>
        ) : null}

        {/* Workflow Pipeline Status Bar */}
        {stats && (
          <Card className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              État d'avancement de l'atelier
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 text-center text-xs">
              <div className="rounded-md border border-border bg-surface-2 p-2.5">
                <div className="font-semibold text-text-secondary">Brouillons</div>
                <div className="mt-1 text-lg font-bold text-text-primary">
                  {stats.status_breakdown.pending || 0}
                </div>
              </div>
              <div className="rounded-md border border-info/30 bg-info/5 p-2.5">
                <div className="font-semibold text-info">Confirmées</div>
                <div className="mt-1 text-lg font-bold text-info">
                  {stats.status_breakdown.confirmed || 0}
                </div>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <div className="font-semibold text-primary">En atelier</div>
                <div className="mt-1 text-lg font-bold text-primary">
                  {stats.status_breakdown.in_progress || 0}
                </div>
              </div>
              <div className="rounded-md border border-warning/30 bg-warning/5 p-2.5">
                <div className="font-semibold text-warning-700 dark:text-warning">Prêtes</div>
                <div className="mt-1 text-lg font-bold text-warning-700 dark:text-warning">
                  {stats.status_breakdown.ready || 0}
                </div>
              </div>
              <div className="rounded-md border border-success/30 bg-success/5 p-2.5">
                <div className="font-semibold text-success">Livrées</div>
                <div className="mt-1 text-lg font-bold text-success">
                  {stats.status_breakdown.delivered || 0}
                </div>
              </div>
              <div className="rounded-md border border-border bg-surface-2 p-2.5">
                <div className="font-semibold text-text-secondary">Annulées</div>
                <div className="mt-1 text-lg font-bold text-text-secondary">
                  {stats.status_breakdown.cancelled || 0}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Recent Orders Table */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-semibold text-text-primary">Commandes récentes</h2>
              <p className="text-xs text-text-secondary">
                Dernières commandes enregistrées dans le système
              </p>
            </div>
            <Link
              to="/commandes"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>Voir tout</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {ordersLoading ? (
            <PageLoader />
          ) : !recentOrders || recentOrders.data.length === 0 ? (
            <div className="p-8 text-center text-text-secondary">
              Aucune commande récente pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">N° Ticket</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Échéance</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3 text-right">Reste</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentOrders.data.map((ord) => (
                    <tr
                      key={ord.id}
                      className="hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        <Link
                          to={`/commandes/${ord.id}`}
                          className="text-primary hover:underline"
                        >
                          {ord.ticket_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {ord.customer_name || <span className="italic text-text-secondary">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge orderType={ord.order_type} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={ord.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                        {ord.due_date ? formatDate(ord.due_date) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-text-primary">
                        {formatMillimes(ord.grand_total)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                        {ord.reste > 0 ? (
                          <span className="text-warning-700 dark:text-warning">
                            {formatMillimes(ord.reste)}
                          </span>
                        ) : (
                          <span className="text-success">Réglé</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => navigate(`/commandes/${ord.id}`)}
                          title="Consulter"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
