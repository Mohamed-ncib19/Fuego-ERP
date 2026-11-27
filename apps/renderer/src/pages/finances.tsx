import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Plus,
  Trash2,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Boxes,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { financeApi, expensesApi, type PaymentReceiptRow } from "@/lib/api/finance.api";
import { useAuthStore } from "@/hooks/use-auth-store";
import { ExpenseFormModal } from "@/components/expenses/expense-form-modal";
import { useToast } from "@/hooks/use-toast";
import { formatMillimes, formatDate, formatDateTime, formatQty } from "@/lib/format";
import {
  Button,
  Card,
  Input,
  Select,
  Label,
  ConfirmDialog,
  Badge,
  PageLoader,
  EmptyState,
  SegmentedTabs,
  TableSkeleton,
} from "@/components/ui";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Expense,
  type ExpenseCategory,
  type PaymentKind,
} from "@fuego/shared";

type FinanceTab = "overview" | "expenses" | "payments";

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
  const canChange = (exp: Expense) => isAdmin || exp.recorded_by === user?.id;

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
        limit: 15,
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
        limit: 15,
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
    >
      {/* Header Actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SegmentedTabs<FinanceTab>
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "overview", label: "Vue d'ensemble" },
            { value: "expenses", label: "Dépenses & Charges" },
            { value: "payments", label: "Journal des encaissements" },
          ]}
        />

        <Button onClick={() => setExpenseForm({ expense: null })} className="shadow-sm">
          <Plus className="h-4 w-4" />
          Déclarer une dépense
        </Button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && stats && (
        <div className="space-y-6">
          {/* Today's Section */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Activité d'aujourd'hui
              </h2>
              <span className="text-xs text-text-secondary">
                {new Date().toLocaleDateString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    Recettes encaissées
                  </span>
                  <div className="rounded-full bg-success/10 p-2 text-success">
                    <ArrowDownRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-success">
                  +{formatMillimes(stats.today.revenue)}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Acomptes & soldes reçus ce jour
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    Dépenses engagées
                  </span>
                  <div className="rounded-full bg-danger/10 p-2 text-danger">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-danger">
                  -{formatMillimes(stats.today.expenses)}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Charges et achats payés ce jour
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    Bénéfice net du jour
                  </span>
                  <div
                    className={`rounded-full p-2 ${
                      stats.today.net_profit >= 0
                        ? "bg-primary/10 text-primary"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    <DollarSign className="h-4 w-4" />
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
                  Recettes moins dépenses
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    Commandes du jour
                  </span>
                  <div className="rounded-full bg-surface-2 p-2 text-text-secondary">
                    <Layers className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-text-primary">
                    {stats.today.orders_count}
                  </span>
                  <span className="text-xs text-text-secondary">créées</span>
                  <span className="text-sm font-semibold text-success">
                    ({stats.today.delivered_count} livrées)
                  </span>
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Activité atelier
                </div>
              </Card>
            </div>
          </div>

          {/* Overall Business Health Cards */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Situation globale & Créances
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4">
                <div className="text-xs font-medium text-text-secondary">
                  Chiffre d'affaires cumulé
                </div>
                <div className="mt-2 text-xl font-bold text-text-primary">
                  {formatMillimes(stats.overall.total_revenue)}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Sur {stats.overall.total_orders} commandes
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs font-medium text-text-secondary">
                  Dépenses totales
                </div>
                <div className="mt-2 text-xl font-bold text-danger">
                  {formatMillimes(stats.overall.total_expenses)}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Total historique
                </div>
              </Card>

              <Card className="p-4 border-warning/40 bg-warning/5">
                <div className="text-xs font-medium text-warning-700 dark:text-warning">
                  Reste à encaisser (Créances)
                </div>
                <div className="mt-2 text-xl font-bold text-warning-800 dark:text-warning">
                  {formatMillimes(stats.overall.outstanding_balances)}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Dû par les clients sur commandes actives
                </div>
              </Card>

              <Card className="p-4 border-info/40 bg-info/5">
                <div className="text-xs font-medium text-info-700 dark:text-info">
                  Acomptes en cours de détention
                </div>
                <div className="mt-2 text-xl font-bold text-info-800 dark:text-info">
                  {formatMillimes(stats.overall.advances_held)}
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Garanties sur commandes non livrées
                </div>
              </Card>
            </div>
          </div>

          {/* 14-Day Visual Trend Chart */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-text-primary">
                  Tendance des flux de trésorerie (14 derniers jours)
                </h3>
                <p className="text-xs text-text-secondary">
                  Comparaison quotidienne des encaissements (vert) et des dépenses (rouge)
                </p>
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
                      <div className="flex w-full items-end justify-center gap-1">
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
        <div className="space-y-4">
          {/* Filters Bar */}
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Catégorie</Label>
                <Select
                  value={expenseCategory}
                  onChange={(e) => {
                    setExpenseCategory(e.target.value);
                    setExpensePage(1);
                  }}
                >
                  <option value="">Toutes les catégories</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Date de début</Label>
                <Input
                  type="date"
                  value={expenseFrom}
                  onChange={(e) => {
                    setExpenseFrom(e.target.value);
                    setExpensePage(1);
                  }}
                />
              </div>

              <div>
                <Label>Date de fin</Label>
                <Input
                  type="date"
                  value={expenseTo}
                  onChange={(e) => {
                    setExpenseTo(e.target.value);
                    setExpensePage(1);
                  }}
                />
              </div>

              <div className="flex flex-col justify-end">
                <div className="rounded-md border border-border bg-surface-2 p-2 text-right">
                  <span className="text-xs text-text-secondary">Total dépenses filtré : </span>
                  <span className="font-bold text-danger">
                    {expensesRes ? formatMillimes(expensesRes.totalAmount) : "..."}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Expenses Table */}
          <Card className="overflow-hidden">
            {expensesLoading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : !expensesRes || expensesRes.data.length === 0 ? (
              <EmptyState
                icon={<Receipt className="h-10 w-10" />}
                title="Aucune dépense enregistrée"
                description="Ajoutez une charge ou ajustez vos filtres de recherche."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Catégorie</th>
                      <th className="px-4 py-3">Note / Description</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                      <th className="px-4 py-3">Enregistré par</th>
                      <th className="px-4 py-3 text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expensesRes.data.map((exp) => (
                      <tr key={exp.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary font-medium">
                          {formatDate(exp.date)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone="neutral">
                            {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {exp.note || (exp.lines.length === 0 && <span className="italic text-text-secondary">—</span>)}
                          {exp.lines.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
                                title="Matières ajoutées au stock"
                              >
                                <Boxes className="h-3.5 w-3.5" />
                                Stock
                              </span>
                              {exp.lines.map((l) => (
                                <span
                                  key={l.id}
                                  className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-text-secondary"
                                >
                                  {l.item_name} · {formatQty(l.quantity, l.item_unit)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-danger">
                          -{formatMillimes(exp.amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                          {exp.recorded_by_label}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {canChange(exp) && (
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => setExpenseForm({ expense: exp })}
                                className="rounded p-1 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                                title="Modifier la dépense"
                                aria-label="Modifier la dépense"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeletingExpense(exp)}
                                className="rounded p-1 text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
                                title="Supprimer la dépense"
                                aria-label="Supprimer la dépense"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {expensesRes && expensesRes.meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
                <span>
                  Page {expensesRes.meta.page} sur {expensesRes.meta.totalPages} (
                  {expensesRes.meta.total} résultats)
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    disabled={expensesRes.meta.page <= 1}
                    onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                    className="p-1.5"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={expensesRes.meta.page >= expensesRes.meta.totalPages}
                    onClick={() => setExpensePage((p) => p + 1)}
                    className="p-1.5"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: PAYMENTS JOURNAL */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Type de paiement</Label>
                <Select
                  value={paymentKind}
                  onChange={(e) => {
                    setPaymentKind(e.target.value);
                    setPaymentPage(1);
                  }}
                >
                  <option value="">Tous les types</option>
                  <option value="advance">Acompte</option>
                  <option value="balance">Règlement du solde</option>
                  <option value="refund">Remboursement</option>
                </Select>
              </div>

              <div>
                <Label>Date de début</Label>
                <Input
                  type="date"
                  value={paymentFrom}
                  onChange={(e) => {
                    setPaymentFrom(e.target.value);
                    setPaymentPage(1);
                  }}
                />
              </div>

              <div>
                <Label>Date de fin</Label>
                <Input
                  type="date"
                  value={paymentTo}
                  onChange={(e) => {
                    setPaymentTo(e.target.value);
                    setPaymentPage(1);
                  }}
                />
              </div>

              <div className="flex flex-col justify-end">
                <div className="rounded-md border border-border bg-surface-2 p-2 text-right">
                  <span className="text-xs text-text-secondary">Total net encaissé : </span>
                  <span className="font-bold text-success">
                    {paymentsRes ? formatMillimes(paymentsRes.totalAmount) : "..."}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Payments Table */}
          <Card className="overflow-hidden">
            {paymentsLoading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : !paymentsRes || paymentsRes.data.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="h-10 w-10" />}
                title="Aucun encaissement trouvé"
                description="Les encaissements enregistrés sur les commandes s'afficheront ici."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">Date & Heure</th>
                      <th className="px-4 py-3">Ticket N°</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                      <th className="px-4 py-3">Note</th>
                      <th className="px-4 py-3">Reçu par</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paymentsRes.data.map((p) => {
                      const isRefund = p.kind === "refund";
                      return (
                        <tr key={p.id} className="hover:bg-surface-2/50 transition-colors">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                            {formatDateTime(p.created_at)}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {p.ticket_no ? (
                              <Link
                                to={`/commandes/${p.order_id}`}
                                className="text-primary hover:underline"
                              >
                                {p.ticket_no}
                              </Link>
                            ) : (
                              <span className="text-text-secondary">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-text-primary">
                            {p.customer_name || "Client anonyme"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              tone={
                                p.kind === "advance"
                                  ? "info"
                                  : p.kind === "balance"
                                    ? "success"
                                    : "danger"
                              }
                            >
                              {p.kind === "advance"
                                ? "Acompte"
                                : p.kind === "balance"
                                  ? "Solde"
                                  : "Remboursement"}
                            </Badge>
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-3 text-right font-bold ${
                              isRefund ? "text-danger" : "text-success"
                            }`}
                          >
                            {isRefund ? "-" : "+"}
                            {formatMillimes(p.amount)}
                          </td>
                          <td className="px-4 py-3 text-xs text-text-secondary">
                            {p.note || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                            {p.recorded_by_label}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {paymentsRes && paymentsRes.meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
                <span>
                  Page {paymentsRes.meta.page} sur {paymentsRes.meta.totalPages} (
                  {paymentsRes.meta.total} encaissements)
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    disabled={paymentsRes.meta.page <= 1}
                    onClick={() => setPaymentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={paymentsRes.meta.page >= paymentsRes.meta.totalPages}
                    onClick={() => setPaymentPage((p) => p + 1)}
                    className="p-1.5"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

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
