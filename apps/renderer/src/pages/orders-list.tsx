import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Calendar,
  AlertCircle,
  Eye,
  Filter,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button, Input, Select, Card, Badge, PageLoader } from "@/components/ui";
import { StatusBadge } from "@/components/orders/status-badge";
import { TypeBadge } from "@/components/orders/type-badge";
import { OrderCard } from "@/components/orders/order-card";
import { ordersApi, type ListOrdersParams } from "@/lib/api/orders.api";
import { formatMillimes, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { formatPhone, type OrderStatus, type OrderSummary } from "@fuego/shared";

type QuickView = "all" | "today" | "overdue" | "to_deliver";

export default function OrdersListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [viewMode, setViewMode] = useState<"table" | "kanban">(() => {
    return (localStorage.getItem("fuego_orders_view") as "table" | "kanban") || "table";
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [orderType, setOrderType] = useState<string>("");
  const [quickView, setQuickView] = useState<QuickView>("all");
  const [page, setPage] = useState(1);
  const limit = 25;

  const handleViewChange = (mode: "table" | "kanban") => {
    setViewMode(mode);
    localStorage.setItem("fuego_orders_view", mode);
  };

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const queryParams = useMemo<ListOrdersParams>(() => {
    const p: ListOrdersParams = {
      page,
      limit,
      search: search.trim() || undefined,
      order_type: orderType || undefined,
    };

    if (quickView === "today") {
      p.from = todayStr;
      p.to = todayStr;
    } else if (quickView === "overdue") {
      p.overdue = true;
    } else if (quickView === "to_deliver") {
      p.order_type = "online";
      p.status = "pending,confirmed,in_progress,ready";
    } else if (status) {
      p.status = status;
    }

    return p;
  }, [page, limit, search, orderType, quickView, todayStr, status]);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", queryParams],
    queryFn: () => ordersApi.list(queryParams),
  });

  // Kanban columns fetch all active orders
  const { data: kanbanData, isLoading: isKanbanLoading } = useQuery({
    queryKey: ["orders-kanban"],
    queryFn: () => ordersApi.list({ limit: 100 }),
    enabled: viewMode === "kanban",
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: OrderStatus }) => {
      if (nextStatus === "confirmed") {
        return ordersApi.confirm(id, {});
      } else if (nextStatus === "in_progress") {
        return ordersApi.start(id, {});
      } else if (nextStatus === "ready") {
        return ordersApi.ready(id, {});
      } else if (nextStatus === "delivered") {
        return ordersApi.deliver(id, {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-kanban"] });
      toast.success("Statut mis à jour avec succès");
    },
    onError: (err: any) => {
      toast.error(err.message || "Action impossible");
    },
  });

  const handleAdvance = (order: OrderSummary) => {
    let nextStatus: OrderStatus | null = null;
    if (order.status === "pending") nextStatus = "confirmed";
    else if (order.status === "confirmed") nextStatus = "in_progress";
    else if (order.status === "in_progress") nextStatus = "ready";
    else if (order.status === "ready") nextStatus = "delivered";

    if (nextStatus) {
      advanceMutation.mutate({ id: order.id, nextStatus });
    }
  };

  const kanbanColumns = useMemo<{ status: OrderStatus; title: string; count: number; orders: OrderSummary[] }[]>(() => {
    const all = kanbanData?.data || [];
    const pending = all.filter((o) => o.status === "pending");
    const confirmed = all.filter((o) => o.status === "confirmed");
    const inProgress = all.filter((o) => o.status === "in_progress");
    const ready = all.filter((o) => o.status === "ready");

    return [
      { status: "pending", title: "En attente", count: pending.length, orders: pending },
      { status: "confirmed", title: "Confirmée", count: confirmed.length, orders: confirmed },
      { status: "in_progress", title: "En cours", count: inProgress.length, orders: inProgress },
      { status: "ready", title: "Prête", count: ready.length, orders: ready },
    ];
  }, [kanbanData]);

  return (
    <DashboardShell
      title="Commandes"
      subtitle="Gestion du flux de production, paiements et livraison"
    >
      <div className="space-y-4">
        {/* Top Controls Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setQuickView("all"); setPage(1); }}
              className={`rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
                quickView === "all" ? "bg-primary text-neutral-950 font-semibold" : "bg-surface border border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              Toutes
            </button>
            <button
              onClick={() => { setQuickView("today"); setPage(1); }}
              className={`rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
                quickView === "today" ? "bg-primary text-neutral-950 font-semibold" : "bg-surface border border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => { setQuickView("overdue"); setPage(1); }}
              className={`rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
                quickView === "overdue" ? "bg-primary text-neutral-950 font-semibold" : "bg-surface border border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              En retard
            </button>
            <button
              onClick={() => { setQuickView("to_deliver"); setPage(1); }}
              className={`rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
                quickView === "to_deliver" ? "bg-primary text-neutral-950 font-semibold" : "bg-surface border border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              À livrer (En ligne)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-btn border border-border bg-surface p-0.5">
              <button
                onClick={() => handleViewChange("table")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "table" ? "bg-surface-2 text-primary font-semibold" : "text-text-secondary hover:text-text-primary"
                }`}
                title="Vue Tableau"
              >
                <TableIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleViewChange("kanban")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "kanban" ? "bg-surface-2 text-primary font-semibold" : "text-text-secondary hover:text-text-primary"
                }`}
                title="Vue Kanban"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar (in table view) */}
        {viewMode === "table" && (
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-secondary" />
                <Input
                  className="pl-9"
                  placeholder="Rechercher ticket, client, tel..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>

              <div>
                <Select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setQuickView("all"); setPage(1); }}
                >
                  <option value="">Tous les statuts</option>
                  <option value="pending">En attente (Brouillon)</option>
                  <option value="confirmed">Confirmée</option>
                  <option value="in_progress">En cours</option>
                  <option value="ready">Prête</option>
                  <option value="delivered">Livrée</option>
                  <option value="cancelled">Annulée</option>
                </Select>
              </div>

              <div>
                <Select
                  value={orderType}
                  onChange={(e) => { setOrderType(e.target.value); setPage(1); }}
                >
                  <option value="">Tous les types</option>
                  <option value="local">Local (Comptoir)</option>
                  <option value="online">En ligne (Livraison)</option>
                </Select>
              </div>

              <div className="flex items-center justify-end text-xs text-text-secondary">
                <span>{data?.meta?.total ?? 0} commande(s) trouvée(s)</span>
              </div>
            </div>
          </Card>
        )}

        {/* Content View: Table or Kanban */}
        {viewMode === "table" ? (
          isLoading ? (
            <PageLoader />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2/50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Ticket</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Articles</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Reste</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      <th className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data?.data.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-text-secondary">
                          Aucune commande trouvée.
                        </td>
                      </tr>
                    ) : (
                      data?.data.map((order) => {
                        const isIncomplete = order.items_count === 0 && order.status === "pending";
                        return (
                          <tr
                            key={order.id}
                            onClick={() => navigate(`/commandes/${order.id}`)}
                            className="cursor-pointer transition-colors hover:bg-surface-2"
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-primary">
                              {order.ticket_no}
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {formatDate(order.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-text-primary">
                                  {order.customer_name || "Sans nom (Brouillon)"}
                                </span>
                                {isIncomplete && (
                                  <Badge tone="danger">
                                    <span className="flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Incomplète
                                    </span>
                                  </Badge>
                                )}
                              </div>
                              {order.customer_phone && (
                                <p className="text-xs text-text-secondary">{formatPhone(order.customer_phone)}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <TypeBadge orderType={order.order_type} />
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {order.items_count} art.
                            </td>
                            <td className="px-4 py-3 font-medium text-text-primary">
                              {formatMillimes(order.grand_total)}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              <span
                                className={
                                  order.reste > 0
                                    ? "text-warning"
                                    : order.reste < 0
                                    ? "text-info"
                                    : "text-success"
                                }
                              >
                                {formatMillimes(order.reste)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={order.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/commandes/${order.id}`);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data?.meta && data.meta.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
                  <span className="text-text-secondary">
                    Page {data.meta.page} sur {data.meta.totalPages} ({data.meta.total} résultats)
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      disabled={page >= data.meta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )
        ) : isKanbanLoading ? (
          <PageLoader />
        ) : (
          /* Kanban Board */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kanbanColumns.map((col) => (
              <div key={col.status} className="flex flex-col rounded-card border border-border bg-surface-2/40 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={col.status} />
                    <span className="font-semibold text-text-primary">{col.title}</span>
                  </div>
                  <Badge tone="neutral">{col.count}</Badge>
                </div>

                <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
                  {col.orders.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-card border border-dashed border-border py-8 text-xs text-text-secondary">
                      Aucune commande
                    </div>
                  ) : (
                    col.orders.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        onAdvance={handleAdvance}
                        advanceLoading={advanceMutation.isPending}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
