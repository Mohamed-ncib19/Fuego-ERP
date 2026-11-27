import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Plus, Receipt, Search } from "lucide-react";
import {
  EXPENSE_CATEGORY_LABELS,
  MATERIAL_KINDS,
  STOCK_EXPENSE_CATEGORY,
  STOCK_ITEM_KIND_LABELS,
  type StockItemKind,
} from "@fuego/shared";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button, Card, EmptyState, ErrorState, Input, Select, TableSkeleton } from "@/components/ui";
import { ItemsTable, sortItems, type ItemSort } from "@/components/stock/items-table";
import { useStockPanels } from "@/components/stock/stock-panels";
import { useStockItems } from "@/hooks/use-stock";
import { useAuthStore } from "@/hooks/use-auth-store";

/**
 * Matières premières — the catalogue of raw materials and supplies: their
 * unit, alert threshold, last purchase price and current quantity.
 */
export default function RawMaterialsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "super_admin";
  const { panels, openItem, openMove, openCreate } = useStockPanels({ isAdmin, defaultKind: "raw_material" });

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<StockItemKind | "">("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<ItemSort>("name");
  const [archived, setArchived] = useState(false);

  const q = useStockItems({
    scope: "materials",
    search: search || undefined,
    kind: kind || undefined,
    include_archived: archived || undefined,
  });

  const categories = useMemo(
    () =>
      [...new Set((q.data?.data ?? []).map((i) => i.category).filter((c): c is string => Boolean(c)))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [q.data],
  );
  const items = useMemo(
    () => sortItems((q.data?.data ?? []).filter((i) => !category || i.category === category), sort),
    [q.data, category, sort],
  );
  const summary = q.data?.summary;
  const filtered = Boolean(search || kind || category || archived);

  return (
    <DashboardShell
      title="Matières premières"
      subtitle={
        summary
          ? `${summary.total} matière(s) et fourniture(s) · ${summary.low + summary.out} en alerte`
          : "Matières et fournitures utilisées par l'atelier"
      }
    >
      {/* The one rule people need to know about this page. */}
      <div className="mb-4 flex items-start gap-3 rounded-card border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
        <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-text-secondary">
          Les achats déclarés en dépense{" "}
          <span className="font-medium text-text-primary">« {EXPENSE_CATEGORY_LABELS[STOCK_EXPENSE_CATEGORY]} »</span>{" "}
          entrent automatiquement en stock.{" "}
          <Link to="/finances" className="font-medium text-primary hover:underline">
            Déclarer un achat
          </Link>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Category chips: quick scoping once a catalogue grows. */}
        <div className="flex max-w-full flex-wrap gap-1.5" role="group" aria-label="Catégories">
          <Chip active={!category} onClick={() => setCategory("")}>
            Toutes
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? "" : c)}>
              {c}
            </Chip>
          ))}
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle matière
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              aria-label="Rechercher une matière"
              placeholder="Rechercher une matière…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as StockItemKind | "")}>
            <option value="">Matières & fournitures</option>
            {MATERIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {STOCK_ITEM_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <Select aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value as ItemSort)}>
            <option value="name">Nom (A → Z)</option>
            <option value="alert">Alertes d'abord</option>
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
            Archivées
          </label>
        </div>

        {q.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="Aucune matière ne correspond"
              description="Modifiez la recherche ou les filtres."
            />
          ) : (
            <EmptyState
              icon={<Layers className="h-10 w-10" />}
              title="Aucune matière première"
              description="Créez vos matières (tissu, encre, papier…) avec leur unité et un seuil d'alerte, ou ajoutez-les directement depuis une dépense."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Ajouter une matière
                </Button>
              }
            />
          )
        ) : (
          <ItemsTable items={items} onOpen={openItem} onMove={openMove} showPrice />
        )}
      </Card>

      {panels}
    </DashboardShell>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
