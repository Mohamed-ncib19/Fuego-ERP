import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Receipt, Plus, Trash2, Pencil, Boxes } from "lucide-react";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { financeApi, expensesApi, type PaymentReceiptRow } from "@/lib/api/finance.api";
import { useAuthStore } from "@/hooks/use-auth-store";
import { ExpenseFormModal } from "@/components/expenses/expense-form-modal";
import { useToast } from "@/hooks/use-toast";
import { formatMillimes, formatDate, formatDateTime, formatQty, type IsoDate } from "@/lib/format";
import { Button, ConfirmDialog, Badge, PageLoader, EmptyState, TableSkeleton, SummaryTile } from "@/components/ui";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Expense,
  type ExpenseCategory,
  type PaymentKind,
} from "@fuego/shared";

type FinanceTab = "overview" | "expenses" | "payments";
type ExpenseRow = Expense & Record<string, unknown>;
type PaymentRow = PaymentReceiptRow & Record<string, unknown>;

const PAGE_SIZE = 15;

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({
  value: c,
  label: EXPENSE_CATEGORY_LABELS[c],
}));

const PAYMENT_KIND_OPTIONS = [
  { value: "advance", label: "Acompte" },
  { value: "balance", label: "Règlement du solde" },
  { value: "refund", label: "Remboursement" },
];

const PAYMENT_KIND_BADGE: Record<string, { tone: "info" | "success" | "danger"; label: string }> = {
  advance: { tone: "info", label: "Acompte" },
  balance: { tone: "success", label: "Solde" },
  refund: { tone: "danger", label: "Remboursement" },
};

function paymentKindBadge(kind: string) {
  const k = PAYMENT_KIND_BADGE[kind] ?? PAYMENT_KIND_BADGE.refund;
  return <Badge tone={k.tone}>{k.label}</Badge>;
}

export default function FinancesPage() {
  const { user } = useAuthStore();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "super_admin";

  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");

  // Expenses Tab State
  const [expenseCategory, setExpenseCategory] = useState<string>("");
  const [expenseFrom, setExpenseFrom] = useState<string>("");
  const [expenseTo, setExpenseTo] = useState<string>("");
  const [expensePage, setExpensePage] = useState<number>(1);

  // Payments Tab State
  const [paymentKind, setPaymentKind] = useState<string>("");
  const [paymentFrom, setPaymentFrom] = useState<string>("");
  const [paymentTo, setPaymentTo] = useState<string>("");
  const [paymentPage, setPaymentPage] = useState<number>(1);

  // Expense form: null = closed, {expense: null} = create, {expense} = edit
  const [expenseForm, setExpenseForm] = useState<{ expense: Expense | null } | null>(null);
  const userId = user?.id;
  const canChange = (exp: Expense) => isAdmin || exp.recorded_by === userId;

  // Delete Expense Dialog State
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  // Queries
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["finance", "stats"],
    queryFn: () => financeApi.getStats(),
  });

  const { data: expensesRes, isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses", { expenseCategory, expenseFrom, expenseTo, expensePage }],
    queryFn: () =>
      expensesApi.list({
        category: (expenseCategory as ExpenseCategory) || undefined,
        from: expenseFrom || undefined,
        to: expenseTo || undefined,
        page: expensePage,
        limit: PAGE_SIZE,
      }),
    enabled: activeTab === "expenses",
  });

  const { data: paymentsRes, isLoading: paymentsLoading } = useQuery({
    queryKey: ["finance", "payments", { paymentKind, paymentFrom, paymentTo, paymentPage }],
    queryFn: () =>
      financeApi.listPayments({
        kind: (paymentKind as PaymentKind) || undefined,
        from: paymentFrom || undefined,
        to: paymentTo || undefined,
        page: paymentPage,
        limit: PAGE_SIZE,
      }),
    enabled: activeTab === "payments",
  });

  // Mutations
  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      toast.success("Dépense supprimée");
      setDeletingExpense(null);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (err: any) => toast.error(err.message || "Impossible de supprimer la dépense"),
  });

  const expensesFiltered = expenseCategory !== "" || expenseFrom !== "" || expenseTo !== "";
  const clearExpenseFilters = () => {
    setExpenseCategory("");
    setExpenseFrom("");
    setExpenseTo("");
    setExpensePage(1);
  };
  const paymentsFiltered = paymentKind !== "" || paymentFrom !== "" || paymentTo !== "";
  const clearPaymentFilters = () => {
    setPaymentKind("");
    setPaymentFrom("");
    setPaymentTo("");
    setPaymentPage(1);
  };

  const expenseColumns = useMemo<TableColumn<ExpenseRow>[]>(
    () => [
      {
        key: "date",
        header: "Date",
        width: pixel(120),
        renderCell: (exp) => (
          <span className="whitespace-nowrap font-medium text-text-secondary">{formatDate(exp.date)}</span>
        ),
      },
      {
        key: "category",
        header: "Catégorie",
        width: pixel(180),
        renderCell: (exp) => (
          <Badge tone="neutral">{EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}</Badge>
        ),
      },
      {
        key: "note",
        header: "Note / Description",
        width: proportional(3),
        renderCell: (exp) => <ExpenseDescription expense={exp} />,
      },
      {
        key: "amount",
        header: "Montant",
        width: pixel(150),
        align: "end",
        renderCell: (exp) => (
          <span className="whitespace-nowrap font-semibold tabular-nums text-danger">
            -{formatMillimes(exp.amount)}
          </span>
        ),
      },
      {
        key: "recorded_by_label",
        header: "Enregistré par",
        width: pixel(160),
        renderCell: (exp) => (
          <Text type="supporting" color="secondary" maxLines={1}>
            {exp.recorded_by_label}
          </Text>
        ),
      },
      {
        key: "actions",
        header: "",
        width: pixel(96),
        align: "end",
        renderCell: (exp) =>
          isAdmin || exp.recorded_by === userId ? (
            <ExpenseActions
              onEdit={() => setExpenseForm({ expense: exp })}
              onDelete={() => setDeletingExpense(exp)}
            />
          ) : null,
      },
    ],
    [isAdmin, userId],
  );

  const paymentColumns = useMemo<TableColumn<PaymentRow>[]>(
    () => [
      {
        key: "created_at",
        header: "Date & heure",
        width: pixel(160),
        renderCell: (p) => (
          <Text type="supporting" color="secondary">
            {formatDateTime(p.created_at)}
          </Text>
        ),
      },
      {
        key: "ticket_no",
        header: "Ticket N°",
        width: pixel(120),
        renderCell: (p) =>
          p.ticket_no ? (
            <Link to={`/commandes/${p.order_id}`} className="font-semibold text-primary hover:underline">
              {p.ticket_no}
            </Link>
          ) : (
            <Text color="secondary">—</Text>
          ),
      },
      {
        key: "customer_name",
        header: "Client",
        width: proportional(2),
        renderCell: (p) => <span className="font-medium">{p.customer_name || "Client anonyme"}</span>,
      },
      {
        key: "kind",
        header: "Type",
        width: pixel(150),
        renderCell: (p) => paymentKindBadge(p.kind),
      },
      {
        key: "amount",
        header: "Montant",
        width: pixel(150),
        align: "end",
        renderCell: (p) => <PaymentAmount payment={p} />,
      },
      {
        key: "note",
        header: "Note",
        width: proportional(2),
        renderCell: (p) => (
          <Text type="supporting" color="secondary">
            {p.note || "—"}
          </Text>
        ),
      },
      {
        key: "recorded_by_label",
        header: "Reçu par",
        width: pixel(150),
        renderCell: (p) => (
          <Text type="supporting" color="secondary" maxLines={1}>
            {p.recorded_by_label}
          </Text>
        ),
      },
    ],
    [],
  );

  if (statsLoading && !stats) {
    return (
      <DashboardShell title="Finances & Comptabilité">
        <PageLoader />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Finances & Comptabilité"
      subtitle="Recettes, charges, trésorerie et rentabilité en temps réel"
      actions={
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setExpenseForm({ expense: null })}>
          Déclarer une dépense
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <TabList value={activeTab} onChange={(v) => setActiveTab(v as FinanceTab)} hasDivider>
          <Tab value="overview" label="Vue d'ensemble" />
          <Tab value="expenses" label="Dépenses & Charges" />
          <Tab value="payments" label="Journal des encaissements" />
        </TabList>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && stats && (
          <div className="flex flex-col gap-6">
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <Text as="h2" type="label" color="secondary">
                  Activité d'aujourd'hui
                </Text>
                <Text type="supporting" color="secondary">
                  {new Date().toLocaleDateString("fr-FR", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile
                  label="Recettes encaissées"
                  value={`+${formatMillimes(stats.today.revenue)}`}
                  tone="success"
                  hint="Acomptes & soldes reçus ce jour"
                />
                <SummaryTile
                  label="Dépenses engagées"
                  value={`-${formatMillimes(stats.today.expenses)}`}
                  tone="danger"
                  hint="Charges et achats payés ce jour"
                />
                <SummaryTile
                  label="Bénéfice net du jour"
                  value={formatMillimes(stats.today.net_profit)}
                  tone={stats.today.net_profit >= 0 ? "primary" : "danger"}
                  hint="Recettes moins dépenses"
                />
                <SummaryTile
                  label="Commandes du jour"
                  value={String(stats.today.orders_count)}
                  hint={`créées · dont ${stats.today.delivered_count} livrée(s)`}
                />
              </div>
            </section>

            <section>
              <Text as="h2" type="label" color="secondary" display="block">
                Situation globale & Créances
              </Text>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile
                  label="Chiffre d'affaires cumulé"
                  value={formatMillimes(stats.overall.total_revenue)}
                  hint={`Sur ${stats.overall.total_orders} commandes`}
                />
                <SummaryTile
                  label="Dépenses totales"
                  value={formatMillimes(stats.overall.total_expenses)}
                  tone="danger"
                  hint="Total historique"
                />
                <SummaryTile
                  label="Reste à encaisser (Créances)"
                  value={formatMillimes(stats.overall.outstanding_balances)}
                  tone="warning"
                  hint="Dû par les clients sur commandes actives"
                />
                <SummaryTile
                  label="Acomptes en cours de détention"
                  value={formatMillimes(stats.overall.advances_held)}
                  tone="info"
                  hint="Garanties sur commandes non livrées"
                />
              </div>
            </section>

            {/* 14-Day Visual Trend Chart */}
            <Card padding={5}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Text as="h3" type="large" weight="semibold" display="block">
                    Tendance des flux de trésorerie (14 derniers jours)
                  </Text>
                  <Text type="supporting" color="secondary" display="block">
                    Comparaison quotidienne des encaissements (vert) et des dépenses (rouge)
                  </Text>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-success" />
                    <span>Recettes</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-danger" />
                    <span>Dépenses</span>
                  </div>
                </div>
              </div>

              {/* Custom Bar Trend Representation */}
              <div className="mt-6 flex h-48 items-end gap-2 border-b border-border pb-2 pt-6">
                {(() => {
                  const maxVal = Math.max(
                    ...stats.trend.flatMap((t) => [t.revenue, t.expenses]),
                    1000,
                  );

                  return stats.trend.map((day) => {
                    const revHeight = Math.max(4, Math.round((day.revenue / maxVal) * 100));
                    const expHeight = Math.max(4, Math.round((day.expenses / maxVal) * 100));
                    const dayName = new Date(day.date).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                    });

                    return (
                      <div
                        key={day.date}
                        className="group relative flex flex-1 flex-col items-center justify-end h-full"
                      >
                        {/* Tooltip on hover */}
                        <div className="pointer-events-none absolute -top-12 z-20 hidden rounded bg-surface border border-border px-2 py-1 text-[11px] shadow-lg group-hover:block whitespace-nowrap text-text-primary">
                          <div className="font-semibold">{day.date}</div>
                          <div className="text-success">+{formatMillimes(day.revenue)}</div>
                          <div className="text-danger">-{formatMillimes(day.expenses)}</div>
                        </div>

                        {/* Bar Pair */}
                        <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1">
                          <div
                            style={{ height: `${day.revenue > 0 ? revHeight : 4}%` }}
                            className={`w-1/2 rounded-t transition-all ${
                              day.revenue > 0 ? "bg-success hover:opacity-80" : "bg-border/40"
                            }`}
                          />
                          <div
                            style={{ height: `${day.expenses > 0 ? expHeight : 4}%` }}
                            className={`w-1/2 rounded-t transition-all ${
                              day.expenses > 0 ? "bg-danger hover:opacity-80" : "bg-border/40"
                            }`}
                          />
                        </div>
                        <span className="mt-2 text-[10px] text-text-secondary">{dayName}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: EXPENSES */}
        {activeTab === "expenses" && (
          <div className="flex flex-col gap-4">
            <FilterBar
              total={expensesRes ? formatMillimes(expensesRes.totalAmount) : "…"}
              totalLabel="Total dépenses filtré"
              totalTone="danger"
            >
              <Selector
                label="Catégorie"
                placeholder="Toutes les catégories"
                options={CATEGORY_OPTIONS}
                value={expenseCategory || null}
                onChange={(v) => {
                  setExpenseCategory(v ?? "");
                  setExpensePage(1);
                }}
                hasClear
                width="100%"
              />
              <DateInput
                label="Date de début"
                value={(expenseFrom || undefined) as IsoDate | undefined}
                onChange={(v) => {
                  setExpenseFrom(v ?? "");
                  setExpensePage(1);
                }}
                format="date"
                hasClear
                width="100%"
              />
              <DateInput
                label="Date de fin"
                value={(expenseTo || undefined) as IsoDate | undefined}
                onChange={(v) => {
                  setExpenseTo(v ?? "");
                  setExpensePage(1);
                }}
                format="date"
                hasClear
                width="100%"
              />
            </FilterBar>

            <Card padding={0}>
              {expensesLoading ? (
                <TableSkeleton rows={6} cols={5} />
              ) : !expensesRes || expensesRes.data.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="h-10 w-10" />}
                  title={expensesFiltered ? "Aucune dépense ne correspond" : "Aucune dépense enregistrée"}
                  description={
                    expensesFiltered
                      ? "Ajustez ou effacez vos filtres de recherche."
                      : "Déclarez une charge pour qu'elle apparaisse ici."
                  }
                  action={
                    expensesFiltered ? (
                      <Button variant="secondary" onClick={clearExpenseFilters}>
                        Effacer les filtres
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table<ExpenseRow>
                      data={expensesRes.data as ExpenseRow[]}
                      columns={expenseColumns}
                      idKey="id"
                      hasHover
                      verticalAlign="middle"
                    />
                  </div>
                  <ul className="divide-y divide-border md:hidden">
                    {expensesRes.data.map((exp) => (
                      <li key={exp.id} className="flex flex-col gap-2 px-4 py-3">
                        <span className="flex items-center justify-between gap-3">
                          <Badge tone="neutral">
                            {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
                          </Badge>
                          <span className="shrink-0 font-semibold tabular-nums text-danger">
                            -{formatMillimes(exp.amount)}
                          </span>
                        </span>
                        <ExpenseDescription expense={exp} />
                        <span className="flex items-center justify-between gap-3">
                          <Text type="supporting" color="secondary">
                            {formatDate(exp.date)} · {exp.recorded_by_label}
                          </Text>
                          {canChange(exp) && (
                            <ExpenseActions
                              onEdit={() => setExpenseForm({ expense: exp })}
                              onDelete={() => setDeletingExpense(exp)}
                            />
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {expensesRes && expensesRes.meta.totalPages > 1 && (
                <PagerFooter
                  page={expensesRes.meta.page}
                  total={expensesRes.meta.total}
                  noun="résultats"
                  onChange={setExpensePage}
                />
              )}
            </Card>
          </div>
        )}

        {/* TAB 3: PAYMENTS JOURNAL */}
        {activeTab === "payments" && (
          <div className="flex flex-col gap-4">
            <FilterBar
              total={paymentsRes ? formatMillimes(paymentsRes.totalAmount) : "…"}
              totalLabel="Total net encaissé"
              totalTone="success"
            >
              <Selector
                label="Type de paiement"
                placeholder="Tous les types"
                options={PAYMENT_KIND_OPTIONS}
                value={paymentKind || null}
                onChange={(v) => {
                  setPaymentKind(v ?? "");
                  setPaymentPage(1);
                }}
                hasClear
                width="100%"
              />
              <DateInput
                label="Date de début"
                value={(paymentFrom || undefined) as IsoDate | undefined}
                onChange={(v) => {
                  setPaymentFrom(v ?? "");
                  setPaymentPage(1);
                }}
                format="date"
                hasClear
                width="100%"
              />
              <DateInput
                label="Date de fin"
                value={(paymentTo || undefined) as IsoDate | undefined}
                onChange={(v) => {
                  setPaymentTo(v ?? "");
                  setPaymentPage(1);
                }}
                format="date"
                hasClear
                width="100%"
              />
            </FilterBar>

            <Card padding={0}>
              {paymentsLoading ? (
                <TableSkeleton rows={6} cols={6} />
              ) : !paymentsRes || paymentsRes.data.length === 0 ? (
                <EmptyState
                  icon={<DollarSign className="h-10 w-10" />}
                  title={paymentsFiltered ? "Aucun encaissement ne correspond" : "Aucun encaissement trouvé"}
                  description={
                    paymentsFiltered
                      ? "Ajustez ou effacez vos filtres de recherche."
                      : "Les encaissements enregistrés sur les commandes s'afficheront ici."
                  }
                  action={
                    paymentsFiltered ? (
                      <Button variant="secondary" onClick={clearPaymentFilters}>
                        Effacer les filtres
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table<PaymentRow>
                      data={paymentsRes.data as PaymentRow[]}
                      columns={paymentColumns}
                      idKey="id"
                      hasHover
                      verticalAlign="middle"
                    />
                  </div>
                  <ul className="divide-y divide-border md:hidden">
                    {paymentsRes.data.map((p) => (
                      <li key={p.id} className="flex flex-col gap-1.5 px-4 py-3">
                        <span className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate font-medium">
                            {p.ticket_no ? (
                              <Link
                                to={`/commandes/${p.order_id}`}
                                className="font-semibold text-primary hover:underline"
                              >
                                {p.ticket_no}
                              </Link>
                            ) : (
                              <Text color="secondary">—</Text>
                            )}{" "}
                            · {p.customer_name || "Client anonyme"}
                          </span>
                          <PaymentAmount payment={p} />
                        </span>
                        <span className="flex items-center justify-between gap-3">
                          <Text type="supporting" color="secondary">
                            {formatDateTime(p.created_at)} · {p.recorded_by_label}
                          </Text>
                          {paymentKindBadge(p.kind)}
                        </span>
                        {p.note && (
                          <Text type="supporting" color="secondary">
                            {p.note}
                          </Text>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {paymentsRes && paymentsRes.meta.totalPages > 1 && (
                <PagerFooter
                  page={paymentsRes.meta.page}
                  total={paymentsRes.meta.total}
                  noun="encaissements"
                  onChange={setPaymentPage}
                />
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Declare / edit an expense — materials lines feed the stock */}
      <ExpenseFormModal
        open={Boolean(expenseForm)}
        onClose={() => setExpenseForm(null)}
        expense={expenseForm?.expense}
      />

      {/* CONFIRM DIALOG: SUPPRESSION DÉPENSE */}
      <ConfirmDialog
        open={Boolean(deletingExpense)}
        onClose={() => setDeletingExpense(null)}
        onConfirm={() => {
          if (deletingExpense) deleteExpenseMutation.mutate(deletingExpense.id);
        }}
        title="Supprimer la dépense"
        message={
          deletingExpense
            ? `Supprimer la dépense de ${formatMillimes(deletingExpense.amount)} (${
                EXPENSE_CATEGORY_LABELS[deletingExpense.category]
              }) ?${
                deletingExpense.lines.length > 0
                  ? ` Les ${deletingExpense.lines.length} matière(s) achetée(s) seront retirées du stock.`
                  : ""
              } L'opération est enregistrée dans le journal d'audit.`
            : ""
        }
        confirmLabel="Supprimer"
        danger
        loading={deleteExpenseMutation.isPending}
      />
    </DashboardShell>
  );
}



/** Three filter fields on the left, the filtered total on the right. */
function FilterBar({
  children,
  total,
  totalLabel,
  totalTone,
}: {
  children: ReactNode;
  total: string;
  totalLabel: string;
  totalTone: "success" | "danger";
}) {
  return (
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
      <div className="flex flex-col items-start sm:items-end">
        <Text type="supporting" color="secondary">
          {totalLabel}
        </Text>
        <span className={`text-xl font-semibold leading-tight tabular-nums ${totalTone === "success" ? "text-success" : "text-danger"}`}>
          {total}
        </span>
      </div>
    </div>
  );
}

function PagerFooter({
  page,
  total,
  noun,
  onChange,
}: {
  page: number;
  total: number;
  noun: string;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <Text type="supporting" color="secondary">
        {total} {noun}
      </Text>
      <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onChange={onChange} size="sm" />
    </div>
  );
}

function ExpenseDescription({ expense }: { expense: Expense }) {
  return (
    <div className="min-w-0">
      {expense.note ||
        (expense.lines.length === 0 && <span className="italic text-text-secondary">—</span>)}
      {expense.lines.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
            title="Matières ajoutées au stock"
          >
            <Boxes className="h-3.5 w-3.5" />
            Stock
          </span>
          {expense.lines.map((l) => (
            <span
              key={l.id}
              className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-text-secondary"
            >
              {l.item_name} · {formatQty(l.quantity, l.item_unit)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <IconButton
        label="Modifier la dépense"
        tooltip="Modifier"
        icon={<Icon icon={Pencil} size="sm" />}
        variant="ghost"
        size="sm"
        onClick={onEdit}
      />
      <IconButton
        label="Supprimer la dépense"
        tooltip="Supprimer"
        icon={<Icon icon={Trash2} size="sm" />}
        variant="ghost"
        size="sm"
        onClick={onDelete}
      />
    </div>
  );
}

function PaymentAmount({ payment }: { payment: PaymentReceiptRow }) {
  const isRefund = payment.kind === "refund";
  return (
    <span
      className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${isRefund ? "text-danger" : "text-success"}`}
    >
      {isRefund ? "-" : "+"}
      {formatMillimes(payment.amount)}
    </span>
  );
}
