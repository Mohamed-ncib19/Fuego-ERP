import { useEffect, useMemo, useState } from "react";
import { Boxes, Plus, Search, ShoppingCart } from "lucide-react";
import { STOCK_UNIT_LABELS, stockNameKey, type StockItem, type StockLevel } from "@fuego/shared";
import {
  Table,
  pixel,
  proportional,
  useTableSortable,
  useTableSortableState,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { MoreMenu as AxMoreMenu } from "@astryxdesign/core/MoreMenu";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button, EmptyState, ErrorState, TableSkeleton, SummaryTile } from "@/components/ui";
import { StockGauge, StockLevelDot } from "@/components/stock/stock-level";
import { MovementsTable } from "@/components/stock/movements-table";
import { useStockActions } from "@/components/stock/stock-actions";
import { useStockCategories, useStockItems, useStockMovements } from "@/hooks/use-stock";
import { useAuthStore } from "@/hooks/use-auth-store";
import { formatMillimes, formatQty } from "@/lib/format";

type View = "all" | "alert" | "archived";
type Row = StockItem & Record<string, unknown>;

/** Alerts first (out, then low), then by name. */
const LEVEL_ORDER: Record<StockLevel, number> = { out: 0, low: 1, ok: 2 };

/**
 * Stock — the single screen for materials: what is in stock, what needs
 * buying, and what happened. Buying goes through a dépense (one click from
 * here), so finances and stock always agree.
 */
export default function StockPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const actions = useStockActions({ isAdmin });
  const [tab, setTab] = useState<"items" | "history">("items");
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  // Archived items only exist from before permanent delete; fetched so the
  // "Archivés" filter can appear just when there are some.
  const itemsQ = useStockItems({ include_archived: true });
  const { data: categories = [] } = useStockCategories();
  const summary = itemsQ.data?.summary;
  const alerts = summary ? summary.low + summary.out : 0;
  const archivedCount = (itemsQ.data?.data ?? []).filter((i) => !i.is_active).length;
  useEffect(() => {
    if (view === "archived" && itemsQ.data && archivedCount === 0) setView("all");
  }, [view, archivedCount, itemsQ.data]);

  const visible = useMemo(() => {
    const all = itemsQ.data?.data ?? [];
    const q = stockNameKey(search);
    return all
      .filter((i) => (view === "archived" ? !i.is_active : i.is_active))
      .filter((i) => view !== "alert" || i.level !== "ok")
      .filter((i) => !category || i.category === category)
      .filter((i) => !q || stockNameKey(i.name).includes(q) || stockNameKey(i.category ?? "").includes(q))
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name, "fr"));
  }, [itemsQ.data, view, search, category]);

  const { sortedData, sortConfig } = useTableSortableState<Row>({ data: visible as Row[] });
  const sortPlugin = useTableSortable<Row>(sortConfig);
  const filtered = search.trim() !== "" || category !== null || view !== "all";
  const clearFilters = () => {
    setSearch("");
    setCategory(null);
    setView("all");
  };

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: "name",
        header: "Article",
        width: proportional(2),
        sortable: true,
        renderCell: (i) => (
          <button
            type="button"
            onClick={() => actions.openItem(i)}
            className="flex min-w-0 flex-col items-start text-left"
          >
            <span className="font-medium text-text-primary hover:underline">{i.name}</span>
            {i.category && (
              <Text type="supporting" color="secondary" maxLines={1}>
                {i.category}
              </Text>
            )}
          </button>
        ),
      },
      {
        key: "quantity",
        header: "En stock",
        width: proportional(2),
        sortable: true,
        renderCell: (i) => (
          <div className="flex w-full max-w-[220px] flex-col gap-1.5">
            <span className="font-semibold tabular-nums">{formatQty(i.quantity, i.unit)}</span>
            <StockGauge item={i} />
          </div>
        ),
      },
      {
        key: "level",
        header: "État",
        width: pixel(150),
        renderCell: (i) => <StockLevelDot level={i.level} />,
      },
      {
        key: "last_unit_cost",
        header: "Dernier prix",
        width: pixel(150),
        align: "end",
        sortable: true,
        renderCell: (i) =>
          i.last_unit_cost === null ? (
            <Text color="secondary">—</Text>
          ) : (
            <span className="tabular-nums">
              {formatMillimes(i.last_unit_cost)}
              <Text type="supporting" color="secondary">
                {" "}
                / {STOCK_UNIT_LABELS[i.unit]}
              </Text>
            </span>
          ),
      },
      {
        key: "actions",
        header: "",
        width: pixel(190),
        align: "end",
        renderCell: (i) => (
          <div className="flex items-center justify-end gap-1">
            {i.is_active ? (
              <>
                <AxButton
                  label="Acheter"
                  size="sm"
                  variant="secondary"
                  icon={<Icon icon={ShoppingCart} size="sm" />}
                  onClick={() => actions.openBuy(i)}
                />
                <AxMoreMenu
                  size="sm"
                  label={`Actions pour ${i.name}`}
                  alignment="end"
                  items={[
                    { label: "Utiliser (sortie)", onClick: () => actions.openMove(i, "exit") },
                    { label: "Ajouter sans achat", onClick: () => actions.openMove(i, "entry") },
                    {
                      label: "Compter (inventaire)",
                      isDisabled: !isAdmin,
                      description: isAdmin ? undefined : "Réservé à l'administrateur",
                      onClick: () => actions.openMove(i, "count"),
                    },
                    { type: "divider" },
                    { label: "Voir le détail", onClick: () => actions.openItem(i) },
                    { label: "Modifier", onClick: () => actions.openEdit(i) },
                    ...(isAdmin
                      ? [
                          { type: "divider" as const },
                          { label: "Supprimer", variant: "destructive" as const, onClick: () => actions.openDelete(i) },
                        ]
                      : []),
                  ]}
                />
              </>
            ) : (
              <>
                {isAdmin && (
                  <AxButton label="Réactiver" size="sm" variant="secondary" onClick={() => actions.restore(i)} />
                )}
                <AxButton label="Voir" size="sm" variant="ghost" onClick={() => actions.openItem(i)} />
              </>
            )}
          </div>
        ),
      },
    ],
    [actions, isAdmin],
  );

  return (
    <DashboardShell
      title="Stock"
      subtitle="Matières premières et fournitures"
      actions={
        <Button icon={<Plus className="h-4 w-4" />} onClick={actions.openCreate}>
          Nouvelle matière
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Three numbers that matter: how many, how many to buy, what it is worth. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SummaryTile label="Articles suivis" value={summary ? String(summary.total) : "—"} />
          <SummaryTile
            label="À réapprovisionner"
            value={summary ? String(alerts) : "—"}
            tone={alerts > 0 ? "warning" : undefined}
            hint={summary && summary.out > 0 ? `dont ${summary.out} en rupture` : undefined}
          />
          <SummaryTile
            className="col-span-2 sm:col-span-1"
            label="Valeur du stock"
            value={summary ? formatMillimes(summary.value) : "—"}
            hint="au dernier prix d'achat"
          />
        </div>

        <TabList value={tab} onChange={(v) => setTab(v as typeof tab)} hasDivider>
          <Tab value="items" label="Articles" />
          <Tab value="history" label="Historique des mouvements" />
        </TabList>

        {tab === "items" ? (
          <>
            {alerts > 0 && view === "all" && (
              <Banner
                status="warning"
                title={`${alerts} article${alerts > 1 ? "s" : ""} à réapprovisionner`}
                description={`${alerts > 1 ? "Ils ont" : "Il a"} atteint le seuil d'alerte. « Acheter » enregistre l'achat : la dépense et l'entrée en stock sont créées ensemble.`}
                endContent={<AxButton label="Afficher" size="sm" onClick={() => setView("alert")} />}
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl label="Filtrer les articles" value={view} onChange={(v) => setView(v as View)}>
                <SegmentedControlItem value="all" label="Tous" />
                <SegmentedControlItem
                  value="alert"
                  label={alerts > 0 ? `À réapprovisionner (${alerts})` : "À réapprovisionner"}
                />
                {archivedCount > 0 && <SegmentedControlItem value="archived" label={`Archivés (${archivedCount})`} />}
              </SegmentedControl>
              <div className="ml-auto flex w-full flex-wrap gap-3 sm:w-auto">
                {categories.length > 0 && (
                  <div className="min-w-0 flex-1 sm:w-[210px] sm:flex-none">
                    <Selector
                      label="Catégorie"
                      isLabelHidden
                      placeholder="Toutes les catégories"
                      options={categories}
                      value={category}
                      onChange={setCategory}
                      hasClear
                      width="100%"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 sm:w-[260px] sm:flex-none">
                  <TextInput
                    label="Rechercher un article"
                    isLabelHidden
                    type="search"
                    value={search}
                    onChange={setSearch}
                    placeholder="Rechercher…"
                    startIcon={<Icon icon={Search} size="sm" />}
                    hasClear
                    width="100%"
                  />
                </div>
              </div>
            </div>

            <Card padding={0}>
              {itemsQ.isLoading ? (
                <TableSkeleton rows={5} cols={4} />
              ) : itemsQ.isError ? (
                <ErrorState
                  message={(itemsQ.error as Error).message}
                  onRetry={() => void itemsQ.refetch()}
                />
              ) : (summary?.total ?? 0) === 0 && view !== "archived" ? (
                <EmptyState
                  icon={<Boxes className="h-8 w-8" />}
                  title="Aucune matière pour l'instant"
                  description="Ajoutez vos matières premières et fournitures. Leur achat crée automatiquement la dépense et l'entrée en stock."
                  action={
                    <Button icon={<Plus className="h-4 w-4" />} onClick={actions.openCreate}>
                      Nouvelle matière
                    </Button>
                  }
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  title={view === "archived" ? "Aucun article archivé" : "Aucun article ne correspond"}
                  description={
                    view === "alert" && !search && !category
                      ? "Tout est au-dessus du seuil d'alerte."
                      : undefined
                  }
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
                      plugins={{ sort: sortPlugin }}
                    />
                  </div>
                  <ul className="divide-y divide-border md:hidden">
                    {visible.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => actions.openItem(i)}
                          className="flex w-full flex-col gap-2 px-4 py-3 text-left"
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-medium">{i.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {formatQty(i.quantity, i.unit)}
                            </span>
                          </span>
                          <StockGauge item={i} />
                          <StockLevelDot level={i.level} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </>
        ) : (
          <HistoryTab onOpenItem={actions.openItem} />
        )}
      </div>
      {actions.overlays}
    </DashboardShell>
  );
}


const KIND_FILTERS = [
  { value: "purchase", label: "Achats" },
  { value: "exit", label: "Sorties" },
  { value: "entry", label: "Entrées sans achat" },
  { value: "adjustment", label: "Inventaires" },
  { value: "initial", label: "Stock initial" },
  { value: "purchase_correction", label: "Corrections d'achat" },
  { value: "purchase_reversal", label: "Achats annulés" },
];

function HistoryTab({ onOpenItem }: { onOpenItem: (id: string) => void }) {
  const [kind, setKind] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const q = useStockMovements({
    kind: (kind ?? undefined) as Parameters<typeof useStockMovements>[0]["kind"],
    limit,
  });
  const total = q.data?.meta.total ?? 0;
  const rows = q.data?.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text color="secondary">
          {q.data ? `${total} mouvement${total > 1 ? "s" : ""}` : "Chargement…"}
        </Text>
        <Selector
          label="Type de mouvement"
          isLabelHidden
          placeholder="Tous les mouvements"
          options={KIND_FILTERS}
          value={kind}
          onChange={setKind}
          hasClear
          width={240}
        />
      </div>
      <Card padding={0}>
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        ) : (
          <MovementsTable
            movements={rows}
            onOpenItem={onOpenItem}
            emptyTitle={kind ? "Aucun mouvement de ce type" : "Aucun mouvement pour l'instant"}
          />
        )}
      </Card>
      {rows.length < total && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + 50)} loading={q.isFetching}>
            Afficher plus
          </Button>
        </div>
      )}
    </div>
  );
}
