import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Package, PackageX, Plus, Search, Wallet } from "lucide-react";
import {
  STOCK_ITEM_KINDS,
  STOCK_ITEM_KIND_LABELS,
  STOCK_MOVEMENT_KINDS,
  STOCK_MOVEMENT_LABELS,
  type StockItemKind,
  type StockLevel,
  type StockMovementKind,
} from "@fuego/shared";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Label,
  SegmentedTabs,
  Select,
  Skeleton,
  TableSkeleton,
} from "@/components/ui";
import { ItemsTable, sortItems, type ItemSort } from "@/components/stock/items-table";
import { MovementsTable } from "@/components/stock/movements-list";
import { useStockPanels } from "@/components/stock/stock-panels";
import { useStockItems, useStockMovements } from "@/hooks/use-stock";
import { useAuthStore } from "@/hooks/use-auth-store";
import { formatMillimes } from "@/lib/format";

type Tab = "inventory" | "movements";

/**
 * Gestion du stock — every item (materials, supplies, articles), its live
 * quantity and the ledger of movements behind it.
 */
export default function StockPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "super_admin";
  const [tab, setTab] = useState<Tab>("inventory");
  const { panels, openItem, openMove, openCreate } = useStockPanels({ isAdmin });

  // Inventory filters
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<StockItemKind | "">("");
  const [level, setLevel] = useState<StockLevel | "">("");
  const [sort, setSort] = useState<ItemSort>("alert");
  const [archived, setArchived] = useState(false);

  const itemsQ = useStockItems({
    search: search || undefined,
    kind: kind || undefined,
    level: level || undefined,
    include_archived: archived || undefined,
  });
  const items = useMemo(() => sortItems(itemsQ.data?.data ?? [], sort), [itemsQ.data, sort]);
  const summary = itemsQ.data?.summary;
  const filtered = Boolean(search || kind || level || archived);

  // Movement filters
  const [mKind, setMKind] = useState<StockMovementKind | "">("");
  const [mFrom, setMFrom] = useState("");
  const [mTo, setMTo] = useState("");
  const [mPage, setMPage] = useState(1);
  const movesQ = useStockMovements(
    { kind: mKind || undefined, from: mFrom || undefined, to: mTo || undefined, page: mPage, limit: 25 },
    tab === "movements",
  );

  const toggleLevel = (l: StockLevel) => {
    setLevel((cur) => (cur === l ? "" : l));
    setTab("inventory");
  };

  return (
    <DashboardShell title="Gestion du stock" subtitle="Quantités disponibles, alertes et historique des mouvements">
      {/* Summary — the low/out tiles double as filters. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          icon={<Package className="h-4 w-4" />}
          label="Articles suivis"
          value={summary?.total}
          active={false}
        />
        <SummaryTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Stock bas"
          value={summary?.low}
          tone="warning"
          active={level === "low"}
          onClick={() => toggleLevel("low")}
        />
        <SummaryTile
          icon={<PackageX className="h-4 w-4" />}
          label="En rupture"
          value={summary?.out}
          tone="danger"
          active={level === "out"}
          onClick={() => toggleLevel("out")}
        />
        <SummaryTile
          icon={<Wallet className="h-4 w-4" />}
          label="Valeur estimée"
          value={summary ? formatMillimes(summary.value) : undefined}
          hint="au dernier prix d'achat"
          active={false}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "inventory", label: "Inventaire" },
            { value: "movements", label: "Mouvements" },
          ]}
        />
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvel article
        </Button>
      </div>

      {tab === "inventory" && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                aria-label="Rechercher un article"
                placeholder="Rechercher par nom ou catégorie…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as StockItemKind | "")}>
              <option value="">Tous les types</option>
              {STOCK_ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {STOCK_ITEM_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <Select aria-label="État" value={level} onChange={(e) => setLevel(e.target.value as StockLevel | "")}>
              <option value="">Tous les états</option>
              <option value="ok">Disponible</option>
              <option value="low">Stock bas</option>
              <option value="out">Rupture</option>
            </Select>
            <Select aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value as ItemSort)}>
              <option value="alert">Alertes d'abord</option>
              <option value="name">Nom (A → Z)</option>
              <option value="quantity">Quantité croissante</option>
              <option value="recent">Mouvement récent</option>
            </Select>
            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--color-primary-500))]"
              />
              Archivés
            </label>
          </div>

          {itemsQ.isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : itemsQ.isError ? (
            <ErrorState message={(itemsQ.error as Error).message} onRetry={() => itemsQ.refetch()} />
          ) : items.length === 0 ? (
            filtered ? (
              <EmptyState
                icon={<Search className="h-10 w-10" />}
                title="Aucun article ne correspond"
                description="Modifiez la recherche ou les filtres."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setKind("");
                      setLevel("");
                      setArchived(false);
                    }}
                  >
                    Effacer les filtres
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Package className="h-10 w-10" />}
                title="Le stock est vide"
                description="Ajoutez un article ici, ou déclarez une dépense « Matières & Fournitures » : les matières achetées entrent automatiquement en stock."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={openCreate}>
                      <Plus className="h-4 w-4" />
                      Ajouter un article
                    </Button>
                    <Link to="/finances">
                      <Button variant="secondary">Déclarer une dépense</Button>
                    </Link>
                  </div>
                }
              />
            )
          ) : (
            <ItemsTable items={items} onOpen={openItem} onMove={openMove} />
          )}
        </Card>
      )}

      {tab === "movements" && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="mv-kind">Type de mouvement</Label>
              <Select
                id="mv-kind"
                value={mKind}
                onChange={(e) => {
                  setMKind(e.target.value as StockMovementKind | "");
                  setMPage(1);
                }}
              >
                <option value="">Tous</option>
                {STOCK_MOVEMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {STOCK_MOVEMENT_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="mv-from">Du</Label>
              <Input
                id="mv-from"
                type="date"
                value={mFrom}
                onChange={(e) => {
                  setMFrom(e.target.value);
                  setMPage(1);
                }}
              />
            </div>
            <div>
              <Label htmlFor="mv-to">Au</Label>
              <Input
                id="mv-to"
                type="date"
                value={mTo}
                onChange={(e) => {
                  setMTo(e.target.value);
                  setMPage(1);
                }}
              />
            </div>
          </div>

          {movesQ.isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : movesQ.isError ? (
            <ErrorState message={(movesQ.error as Error).message} onRetry={() => movesQ.refetch()} />
          ) : !movesQ.data || movesQ.data.data.length === 0 ? (
            <EmptyState
              icon={<Package className="h-10 w-10" />}
              title="Aucun mouvement"
              description="Achats, entrées, sorties et inventaires s'afficheront ici, du plus récent au plus ancien."
            />
          ) : (
            <MovementsTable movements={movesQ.data.data} onOpenItem={openItem} />
          )}

          {movesQ.data && movesQ.data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
              <span>
                Page {movesQ.data.meta.page} sur {movesQ.data.meta.totalPages} ({movesQ.data.meta.total} mouvements)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  className="p-1.5"
                  aria-label="Page précédente"
                  disabled={mPage <= 1}
                  onClick={() => setMPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  className="p-1.5"
                  aria-label="Page suivante"
                  disabled={mPage >= movesQ.data.meta.totalPages}
                  onClick={() => setMPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {panels}
    </DashboardShell>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | undefined;
  hint?: string;
  tone?: "warning" | "danger";
  active: boolean;
  onClick?: () => void;
}) {
  const hot = tone && typeof value === "number" && value > 0;
  const toneText = tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-text-primary";
  const body = (
    <>
      <div className="flex items-center justify-between text-text-secondary">
        <span className="text-xs font-medium">{label}</span>
        <span className={hot ? toneText : ""}>{icon}</span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className={`mt-1.5 text-2xl font-bold tabular-nums ${hot ? toneText : "text-text-primary"}`}>{value}</p>
      )}
      {hint && <p className="text-[11px] text-text-secondary">{hint}</p>}
      {onClick && hot && (
        <p className="mt-0.5 text-[11px] text-text-secondary">{active ? "Filtre actif — cliquer pour retirer" : "Voir la liste"}</p>
      )}
    </>
  );
  const cls = `rounded-card border bg-surface p-4 text-left shadow-card transition-colors ${
    active ? (tone === "danger" ? "border-danger/60" : "border-warning/60") : "border-border"
  }`;
  return onClick ? (
    <button onClick={onClick} aria-pressed={active} className={`${cls} hover:bg-surface-2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
