import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { STOCK_UNIT_LABELS, stockNameKey, type StockItem } from "@fuego/shared";
import { formatQty } from "@/lib/format";

/**
 * Combobox for one expense line. Typing filters existing materials (accent
 * and case-insensitive); "Créer …" is offered only when no item already has
 * that name — so a purchase links to the existing material instead of
 * duplicating it.
 */
export function MaterialPicker({
  items,
  value,
  onSelect,
  onCreate,
  query,
  onQueryChange,
  excludeIds,
  invalid,
}: {
  items: StockItem[];
  /** Selected item id, or null when typing / creating. */
  value: string | null;
  onSelect: (item: StockItem) => void;
  onCreate: (name: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  /** Items already used on other lines. */
  excludeIds: Set<string>;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  const key = stockNameKey(query);
  const matches = useMemo(
    () =>
      items
        .filter((i) => i.is_active && !excludeIds.has(i.id))
        .filter((i) => !key || stockNameKey(i.name).includes(key) || stockNameKey(i.category ?? "").includes(key))
        .slice(0, 8),
    [items, key, excludeIds],
  );
  const exact = items.find((i) => stockNameKey(i.name) === key);
  const canCreate = key.length > 0 && !exact;
  const options = [...matches.map((m) => ({ kind: "item" as const, item: m })), ...(canCreate ? [{ kind: "create" as const }] : [])];

  useEffect(() => setActive(0), [key]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    if (opt.kind === "item") onSelect(opt.item);
    else onCreate(query.trim());
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-label="Matière"
        value={query}
        placeholder="Rechercher ou créer une matière…"
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && options.length) {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`w-full rounded-btn border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 ${
          invalid ? "border-danger/70 focus:ring-danger/30" : value ? "border-primary/40 focus:ring-primary/30" : "border-border focus:ring-primary/30"
        }`}
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-hover"
        >
          {options.map((opt, idx) =>
            opt.kind === "item" ? (
              <li
                key={opt.item.id}
                role="option"
                aria-selected={idx === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(idx)}
                onMouseEnter={() => setActive(idx)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                  idx === active ? "bg-surface-2" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">{opt.item.name}</span>
                  {opt.item.category && <span className="block truncate text-[11px] text-text-secondary">{opt.item.category}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                  {formatQty(opt.item.quantity, opt.item.unit)}
                </span>
              </li>
            ) : (
              <li
                key="__create"
                role="option"
                aria-selected={idx === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(idx)}
                onMouseEnter={() => setActive(idx)}
                className={`flex cursor-pointer items-center gap-2 border-t border-border px-3 py-2 text-sm text-primary ${
                  idx === active ? "bg-surface-2" : ""
                }`}
              >
                <Plus className="h-4 w-4" />
                Créer « {query.trim()} »
              </li>
            ),
          )}
        </ul>
      )}
      {exact && !value && excludeIds.has(exact.id) && (
        <p className="mt-1 text-xs text-warning">
          « {exact.name} » est déjà sur une autre ligne ({STOCK_UNIT_LABELS[exact.unit]}).
        </p>
      )}
    </div>
  );
}
