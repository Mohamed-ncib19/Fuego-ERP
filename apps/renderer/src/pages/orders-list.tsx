import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Search, LayoutGrid, Table as TableIcon, AlertCircle, Eye } from "lucide-react";
import {
  Table,
  pixel,
  proportional,
  useTableSortable,
  useTableSortableState,
  type TableColumn,
  type TablePlugin,
} from "@astryxdesign/core/Table";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button, EmptyState, ErrorState, PageLoader, TableSkeleton } from "@/components/ui";
import { StatusBadge } from "@/components/orders/status-badge";
import { TypeBadge } from "@/components/orders/type-badge";
import { OrderCard } from "@/components/orders/order-card";
import { ordersApi, type ListOrdersParams } from "@/lib/api/orders.api";
import { formatMillimes, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { formatPhone, type OrderStatus, type OrderSummary } from "@fuego/shared";

type QuickView = "all" | "today" | "overdue" | "to_deliver";
type Row = OrderSummary & Record<string, unknown>;

const STATUS_OPTIONS = [
  { value: "pending", label: "En attente (Brouillon)" },
  { value: "confirmed", label: "Confirmée" },
  { value: "in_progress", label: "En cours" },
  { value: "ready", label: "Prête" },
  { value: "delivered", label: "Livrée" },
  { value: "cancelled", label: "Annulée" },
];

const TYPE_OPTIONS = [
  { value: "local", label: "Local (Comptoir)" },
  { value: "online", label: "En ligne (Livraison)" },
];

/** Money left to pay: warning while due, info when overpaid, success when settled. */
function resteClass(reste: number): string {
  return reste > 0 ? "text-warning" : reste < 0 ? "text-info" : "text-success";
}

const isIncomplete = (o: OrderSummary) => o.items_count === 0 && o.status === "pending";

function IncompleteBadge() {
  return <Badge variant="error" label="Incomplète" icon={<Icon icon={AlertCircle} size="sm" />} />;
}

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

  // A quick view replaces the filters it overrides, so the selectors never
  // show a value the list is not using.
  const handleQuickView = (v: QuickView) => {
    setQuickView(v);
    if (v !== "all") setStatus("");
    if (v === "to_deliver") setOrderType("");
    setPage(1);
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

  const listQ = useQuery({
    queryKey: ["orders", queryParams],
    queryFn: () => ordersApi.list(queryParams),
  });
  const { data } = listQ;

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

  // Sorting reorders the page on screen; the server still pages newest first.
  const rows = useMemo(() => (data?.data ?? []) as Row[], [data]);
  const { sortedData, sortConfig } = useTableSortableState<Row>({ data: rows });
  const sortPlugin = useTableSortable<Row>(sortConfig);

  // The whole row opens the order (the ticket and the eye button do too, for keyboards).
  const rowClickPlugin = useMemo<TablePlugin<Row>>(
    () => ({
      rowModel: "flat",
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          style: { ...props.htmlProps.style, cursor: "pointer" },
          onClick: (e) => {
            if ((e.target as HTMLElement).closest("button, a")) return;
            navigate(`/commandes/${item.id}`);
          },
        },
      }),
    }),
    [navigate],
  );

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: "ticket_no",
        header: "Ticket",
        width: pixel(130),
        sortable: true,
        renderCell: (o) => (
          <button
            type="button"
            onClick={() => navigate(`/commandes/${o.id}`)}
            className="whitespace-nowrap font-mono font-medium text-primary hover:underline"
          >
            {o.ticket_no}
          </button>
        ),
      },
      {
        key: "created_at",
        header: "Date",
        width: pixel(120),
        sortable: true,
        renderCell: (o) => (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {formatDate(o.created_at)}
          </Text>
        ),
      },
      {
        key: "customer_name",
        header: "Client",
        width: proportional(2),
        sortable: true,
        renderCell: (o) => (
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-text-primary">
                {o.customer_name || "Sans nom (Brouillon)"}
              </span>
              {isIncomplete(o) && <IncompleteBadge />}
            </span>
            {o.customer_phone && (
              <Text type="supporting" color="secondary">
                {formatPhone(o.customer_phone)}
              </Text>
            )}
          </div>
        ),
      },
      {
        key: "order_type",
        header: "Type",
        width: pixel(110),
        renderCell: (o) => <TypeBadge orderType={o.order_type} />,
      },
      {
        key: "items_count",
        header: "Articles",
        width: pixel(95),
        align: "end",
        sortable: true,
        renderCell: (o) => (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {o.items_count} art.
          </Text>
        ),
      },
      {
        key: "grand_total",
        header: "Total",
        width: pixel(130),
        align: "end",
        sortable: true,
        renderCell: (o) => (
          <span className="font-medium tabular-nums text-text-primary">{formatMillimes(o.grand_total)}</span>
        ),
      },
      {
        key: "reste",
        header: "Reste",
        width: pixel(130),
        align: "end",
        sortable: true,
        renderCell: (o) => (
          <span className={`font-medium tabular-nums ${resteClass(o.reste)}`}>{formatMillimes(o.reste)}</span>
        ),
      },
      {
        key: "status",
        header: "Statut",
        width: pixel(120),
        renderCell: (o) => <StatusBadge status={o.status} />,
      },
      {
        key: "actions",
        header: "",
        width: pixel(56),
        align: "end",
        renderCell: (o) => (
          <AxButton
            label={`Ouvrir la commande ${o.ticket_no}`}
            isIconOnly
            size="sm"
            variant="ghost"
            icon={<Icon icon={Eye} size="sm" />}
            onClick={() => navigate(`/commandes/${o.id}`)}
          />
        ),
      },
    ],
    [navigate],
  );

  const total = data?.meta?.total ?? 0;
  const filtered = search.trim() !== "" || status !== "" || orderType !== "" || quickView !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setOrderType("");
    setQuickView("all");
    setPage(1);
  };

  return (
    <DashboardShell
      title="Commandes"
      subtitle="Gestion du flux de production, paiements et livraison"
      actions={
        <SegmentedControl
          label="Affichage des commandes"
          value={viewMode}
          onChange={(v) => handleViewChange(v as "table" | "kanban")}
        >
          <SegmentedControlItem value="table" label="Vue tableau" isLabelHidden icon={<Icon icon={TableIcon} size="sm" />} />
          <SegmentedControlItem value="kanban" label="Vue kanban" isLabelHidden icon={<Icon icon={LayoutGrid} size="sm" />} />
        </SegmentedControl>
      }
    >
      <div className="flex flex-col gap-4">
        {viewMode === "table" ? (
          <>
            {/* Quick views, then the fine filters. The kanban shows every active order, so it has none. */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="max-w-full overflow-x-auto [&>*]:w-max">
                <SegmentedControl
                  label="Vues rapides"
                  value={quickView}
                  onChange={(v) => handleQuickView(v as QuickView)}
                >
                  <SegmentedControlItem value="all" label="Toutes" />
                  <SegmentedControlItem value="today" label="Aujourd'hui" />
                  <SegmentedControlItem value="overdue" label="En retard" />
                  <SegmentedControlItem value="to_deliver" label="À livrer" />
                </SegmentedControl>
              </div>
              <div className="ml-auto flex w-full flex-wrap gap-3 lg:w-auto">
                <div className="min-w-0 flex-1 sm:w-[200px] sm:flex-none">
                  <Selector
                    label="Statut"
                    isLabelHidden
                    placeholder="Tous les statuts"
                    options={STATUS_OPTIONS}
                    value={status || null}
                    onChange={(v) => {
                      setStatus(v ?? "");
                      setQuickView("all");
                      setPage(1);
                    }}
                    hasClear
                    width="100%"
                  />
                </div>
                <div className="min-w-0 flex-1 sm:w-[190px] sm:flex-none">
                  <Selector
                    label="Type de commande"
                    isLabelHidden
                    placeholder="Tous les types"
                    options={TYPE_OPTIONS}
                    value={orderType || null}
                    onChange={(v) => {
                      setOrderType(v ?? "");
                      if (v && quickView === "to_deliver") setQuickView("all");
                      setPage(1);
                    }}
                    hasClear
                    width="100%"
                  />
                </div>
                <div className="w-full sm:w-[280px]">
                  <TextInput
                    label="Rechercher une commande"
                    isLabelHidden
                    type="search"
                    placeholder="Ticket, client, téléphone…"
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(1);
                    }}
                    startIcon={<Icon icon={Search} size="sm" />}
                    hasClear
                    width="100%"
                  />
                </div>
              </div>
            </div>

            <Text type="supporting" color="secondary">
              {data ? `${total} commande${total > 1 ? "s" : ""} trouvée${total > 1 ? "s" : ""}` : "Chargement…"}
            </Text>

            <Card padding={0}>
              {listQ.isLoading ? (
                <TableSkeleton rows={6} cols={6} />
              ) : listQ.isError ? (
                <ErrorState message={(listQ.error as Error).message} onRetry={() => void listQ.refetch()} />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="h-8 w-8" />}
                  title={filtered ? "Aucune commande ne correspond" : "Aucune commande trouvée"}
                  description={filtered ? undefined : "Les commandes créées apparaîtront ici."}
                  action={
                    filtered ? (
                      <Button variant="secondary" onClick={clearFilters}>
                        Effacer les filtres
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  {/* Table from md; a tappable list on phones. */}
                  <div className="hidden md:block">
                    <Table<Row>
                      data={sortedData}
                      columns={columns}
                      idKey="id"
                      hasHover
                      verticalAlign="middle"
                      plugins={{ sort: sortPlugin, rowClick: rowClickPlugin }}
                    />
                  </div>
                  <ul className="divide-y divide-border md:hidden">
                    {rows.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/commandes/${o.id}`)}
                          className="flex w-full flex-col gap-1.5 px-4 py-3 text-left"
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-mono text-sm font-medium text-primary">{o.ticket_no}</span>
                            <StatusBadge status={o.status} />
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 truncate font-medium">
                              {o.customer_name || "Sans nom (Brouillon)"}
                            </span>
                            {isIncomplete(o) && <IncompleteBadge />}
                            <TypeBadge orderType={o.order_type} />
                          </span>
                          <span className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-text-secondary">
                              {formatDate(o.created_at)} · {o.items_count} art.
                            </span>
                            <span className="tabular-nums">
                              <span className="font-medium">{formatMillimes(o.grand_total)}</span>
                              {o.reste !== 0 && (
                                <span className={resteClass(o.reste)}> · reste {formatMillimes(o.reste)}</span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {data?.meta && data.meta.totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                      <Text type="supporting" color="secondary">
                        Page {data.meta.page} sur {data.meta.totalPages} ({data.meta.total} résultats)
                      </Text>
                      <Pagination
                        page={page}
                        onChange={setPage}
                        totalPages={data.meta.totalPages}
                        totalItems={data.meta.total}
                        pageSize={limit}
                        size="sm"
                        label="Pages des commandes"
                      />
                    </div>
                  )}
                </>
              )}
            </Card>
          </>
        ) : isKanbanLoading ? (
          <PageLoader />
        ) : (
          /* Kanban Board */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kanbanColumns.map((col) => (
              <section
                key={col.status}
                aria-label={col.title}
                className="flex flex-col rounded-card border border-border bg-surface-2/40 p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <StatusBadge status={col.status} />
                  <Badge variant="neutral" label={String(col.count)} />
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
              </section>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
