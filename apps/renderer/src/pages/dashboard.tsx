import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, Eye } from "lucide-react";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { OrderStatus, OrderSummary } from "@fuego/shared";
import { useAuthStore } from "@/hooks/use-auth-store";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { EmptyState, PageLoader, TableSkeleton, SummaryTile } from "@/components/ui";
import { formatMillimes, formatDate } from "@/lib/format";
import { useSettings } from "@/hooks/use-queries";
import { financeApi } from "@/lib/api/finance.api";
import { ordersApi } from "@/lib/api/orders.api";
import { StatusBadge } from "@/components/orders/status-badge";
import { TypeBadge } from "@/components/orders/type-badge";

type OrderRow = OrderSummary & Record<string, unknown>;

/** Workshop pipeline, in the order an order moves through it. */
const PIPELINE: OrderStatus[] = ["pending", "confirmed", "in_progress", "ready", "delivered", "cancelled"];

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

  const columns = useMemo<TableColumn<OrderRow>[]>(
    () => [
      {
        key: "ticket_no",
        header: "N° Ticket",
        width: pixel(120),
        renderCell: (ord) => (
          <Link to={`/commandes/${ord.id}`} className="whitespace-nowrap font-semibold text-primary hover:underline">
            {ord.ticket_no}
          </Link>
        ),
      },
      {
        key: "customer_name",
        header: "Client",
        width: proportional(2),
        renderCell: (ord) =>
          ord.customer_name ? (
            <span className="font-medium">{ord.customer_name}</span>
          ) : (
            <span className="italic text-text-secondary">—</span>
          ),
      },
      {
        key: "order_type",
        header: "Canal",
        width: pixel(130),
        renderCell: (ord) => <TypeBadge orderType={ord.order_type} />,
      },
      {
        key: "status",
        header: "Statut",
        width: pixel(130),
        renderCell: (ord) => <StatusBadge status={ord.status} />,
      },
      {
        key: "due_date",
        header: "Échéance",
        width: pixel(120),
        renderCell: (ord) => (
          <Text type="supporting" color="secondary">
            {ord.due_date ? formatDate(ord.due_date) : "—"}
          </Text>
        ),
      },
      {
        key: "grand_total",
        header: "Montant",
        width: pixel(140),
        align: "end",
        renderCell: (ord) => (
          <span className="whitespace-nowrap font-medium tabular-nums">{formatMillimes(ord.grand_total)}</span>
        ),
      },
      {
        key: "reste",
        header: "Reste",
        width: pixel(140),
        align: "end",
        renderCell: (ord) => <Reste reste={ord.reste} />,
      },
      {
        key: "actions",
        header: "",
        width: pixel(64),
        align: "end",
        renderCell: (ord) => (
          <IconButton
            label={`Consulter la commande ${ord.ticket_no}`}
            tooltip="Consulter"
            icon={<Icon icon={Eye} size="sm" />}
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/commandes/${ord.id}`)}
          />
        ),
      },
    ],
    [navigate],
  );

  return (
    <DashboardShell
      title={`Bonjour ${firstName} 👋`}
      subtitle={settings?.business_name ? `${settings.business_name} — Vue d'ensemble de l'activité` : "Vue d'ensemble de l'activité"}
    >
      <div className="flex flex-col gap-5">
        {/* Live Operational KPI Cards */}
        {statsLoading ? (
          <PageLoader />
        ) : stats ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile
              label="Recettes aujourd'hui"
              value={`+${formatMillimes(stats.today.revenue)}`}
              tone="success"
              hint={`${stats.today.orders_count} commande(s) créée(s) ce jour`}
            />
            <SummaryTile
              label="Bénéfice net aujourd'hui"
              value={formatMillimes(stats.today.net_profit)}
              tone={stats.today.net_profit >= 0 ? "primary" : "danger"}
              hint={`Dépenses : -${formatMillimes(stats.today.expenses)}`}
            />
            <SummaryTile
              label="Commandes en cours"
              value={String(activeOrdersCount)}
              hint={`${stats.status_breakdown.ready || 0} prête(s) · ${stats.status_breakdown.in_progress || 0} en atelier`}
            />
            <SummaryTile
              label="Reste à encaisser"
              value={formatMillimes(stats.overall.outstanding_balances)}
              tone="warning"
              hint="Créances actives sur commandes"
            />
          </div>
        ) : null}

        {/* Workflow Pipeline Status Bar */}
        {stats && (
          <Card padding={4}>
            <Text as="h3" type="label" color="secondary" display="block">
              État d'avancement de l'atelier
            </Text>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {PIPELINE.map((status) => (
                <div
                  key={status}
                  className="flex flex-col items-start gap-1.5 rounded-md border border-border bg-surface-2 p-3"
                >
                  <StatusBadge status={status} />
                  <span className="text-xl font-semibold leading-tight tabular-nums">
                    {stats.status_breakdown[status] || 0}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Recent Orders */}
        <Card padding={0}>
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <Text as="h2" type="large" weight="semibold" display="block">
                Commandes récentes
              </Text>
              <Text type="supporting" color="secondary" display="block">
                Dernières commandes enregistrées dans le système
              </Text>
            </div>
            <Link
              to="/commandes"
              className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>Voir tout</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {ordersLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : !recentOrders || recentOrders.data.length === 0 ? (
            <EmptyState
              compact
              icon={<ClipboardList className="h-8 w-8" />}
              title="Aucune commande récente pour le moment."
            />
          ) : (
            <>
              {/* Table from md; a tappable list on phones. */}
              <div className="hidden md:block">
                <Table<OrderRow>
                  data={recentOrders.data as OrderRow[]}
                  columns={columns}
                  idKey="id"
                  hasHover
                  verticalAlign="middle"
                />
              </div>
              <ul className="divide-y divide-border md:hidden">
                {recentOrders.data.map((ord) => (
                  <li key={ord.id}>
                    <Link to={`/commandes/${ord.id}`} className="flex flex-col gap-2 px-4 py-3">
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">
                          <span className="font-semibold text-primary">{ord.ticket_no}</span>
                          {ord.customer_name && <span className="font-medium"> · {ord.customer_name}</span>}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMillimes(ord.grand_total)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <StatusBadge status={ord.status} />
                          <TypeBadge orderType={ord.order_type} />
                        </span>
                        <span className="text-sm">
                          <Reste reste={ord.reste} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}

function Reste({ reste }: { reste: number }) {
  return reste > 0 ? (
    <span className="whitespace-nowrap font-semibold tabular-nums text-warning">{formatMillimes(reste)}</span>
  ) : (
    <span className="font-semibold text-success">Réglé</span>
  );
}


