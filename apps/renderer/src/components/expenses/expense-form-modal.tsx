import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  STOCK_EXPENSE_CATEGORY,
  STOCK_UNITS,
  STOCK_UNIT_LABELS,
  STOCK_UNIT_NAMES,
  stockNameKey,
  type Expense,
  type ExpenseCategory,
  type StockItem,
  type StockUnit,
} from "@fuego/shared";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Banner } from "@astryxdesign/core/Banner";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Button, FieldError, Input, Modal } from "@/components/ui";
import { expensesApi, type ExpenseLinePayload } from "@/lib/api/finance.api";
import { useInvalidateStock, useStockItems } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import {
  formatMillimes,
  formatQty,
  lineTotalOf,
  newClientRef,
  parseMoney,
  parseScaled,
  scaledToInput,
  todayIso,
  type IsoDate,
} from "@/lib/format";
import { MaterialPicker } from "./material-picker";

interface LineDraft {
  key: string;
  itemId: string | null;
  /** Set when the material will be created with the expense. */
  newUnit: StockUnit | null;
  unit: StockUnit | null;
  query: string;
  qty: string;
  price: string;
}

type LineErrors = Partial<Record<"item" | "qty" | "price", string>>;

const blankLine = (): LineDraft => ({
  key: newClientRef(),
  itemId: null,
  newUnit: null,
  unit: null,
  query: "",
  qty: "",
  price: "",
});

/**
 * Declare or edit an expense. For "Matières & Fournitures" the purchased
 * materials are entered as lines; the server books them into the stock in
 * the same transaction as the expense, and the amount is their total.
 */
export function ExpenseFormModal({
  open,
  onClose,
  expense,
  presetItem,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit mode when set. */
  expense?: Expense | null;
  /** New purchase of this material ("Acheter" from the stock screen). */
  presetItem?: StockItem | null;
}) {
  const toast = useToast();
  const invalidate = useInvalidateStock();
  const editing = Boolean(expense);

  const [category, setCategory] = useState<ExpenseCategory>(STOCK_EXPENSE_CATEGORY);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState<string>(todayIso());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [clientRef, setClientRef] = useState(newClientRef());
  const [errors, setErrors] = useState<{ amount?: string; lines?: Record<string, LineErrors>; form?: string }>({});

  const isMaterials = category === STOCK_EXPENSE_CATEGORY;
  const itemsQ = useStockItems({}, open && isMaterials);
  const items = itemsQ.data?.data ?? [];

  // Reset on every open — a fresh idempotency key per opened form.
  useEffect(() => {
    if (!open) return;
    setClientRef(newClientRef());
    setErrors({});
    if (expense) {
      setCategory(expense.category);
      setAmount(scaledToInput(expense.amount));
      setNote(expense.note ?? "");
      setDate(expense.date);
      setLines(
        expense.lines.map((l) => ({
          key: l.id,
          itemId: l.stock_item_id,
          newUnit: null,
          unit: l.item_unit,
          query: l.item_name,
          qty: scaledToInput(l.quantity),
          price: scaledToInput(l.unit_price),
        })),
      );
    } else {
      setCategory(STOCK_EXPENSE_CATEGORY);
      setAmount("");
      setNote("");
      setDate(todayIso());
      setLines([
        presetItem
          ? {
              ...blankLine(),
              itemId: presetItem.id,
              unit: presetItem.unit,
              query: presetItem.name,
              price: presetItem.last_unit_cost !== null ? scaledToInput(presetItem.last_unit_cost) : "",
            }
          : blankLine(),
      ]);
    }
  }, [open, expense, presetItem]);

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** Lines with something typed in them — fully blank rows are ignored. */
  const usedLines = lines.filter((l) => l.itemId || l.query.trim() || l.qty.trim() || l.price.trim());
  const sendLines = isMaterials && usedLines.length > 0;

  const lineTotals = useMemo(
    () =>
      new Map(
        lines.map((l) => {
          const q = parseScaled(l.qty);
          const p = parseMoney(l.price);
          return [l.key, q !== null && p !== null ? lineTotalOf(q, p) : null] as const;
        }),
      ),
    [lines],
  );
  const linesTotal = usedLines.reduce((s, l) => s + (lineTotals.get(l.key) ?? 0), 0);
  const droppedLines = !isMaterials ? lines.filter((l) => l.itemId || l.query.trim()).length : 0;

  const mutation = useMutation({
    mutationFn: (payload: { lines?: ExpenseLinePayload[]; amount?: number }) => {
      const body = {
        category,
        note: note.trim() || undefined,
        date: date || undefined,
        ...payload,
      };
      return editing && expense
        ? expensesApi.update(expense.id, { ...body, note: note.trim() })
        : expensesApi.create({ ...body, client_ref: clientRef });
    },
    onSuccess: (saved) => {
      const n = saved.lines.length;
      toast.success(
        editing
          ? "Dépense mise à jour"
          : n > 0
            ? `Dépense enregistrée — ${n} matière${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} au stock`
            : "Dépense enregistrée",
      );
      invalidate();
      onClose();
    },
    onError: (err: Error) => setErrors((e) => ({ ...e, form: err.message })),
  });

  const submit = () => {
    if (mutation.isPending) return;
    const lineErrors: Record<string, LineErrors> = {};
    const payloadLines: ExpenseLinePayload[] = [];
    const seen = new Set<string>();

    if (sendLines) {
      for (const l of usedLines) {
        const le: LineErrors = {};
        // A typed name that exactly matches an existing material links to it.
        const exact = !l.itemId && !l.newUnit ? items.find((i) => stockNameKey(i.name) === stockNameKey(l.query)) : undefined;
        const itemId = l.itemId ?? exact?.id ?? null;
        if (!itemId && !(l.newUnit && l.query.trim())) le.item = "Choisissez une matière ou créez-la";
        if (itemId && seen.has(itemId)) le.item = "Déjà sur une autre ligne";
        if (itemId) seen.add(itemId);
        const q = parseScaled(l.qty);
        if (q === null || q <= 0) le.qty = "Quantité invalide";
        const p = parseMoney(l.price);
        if (p === null) le.price = "Prix invalide";
        if (Object.keys(le).length) {
          lineErrors[l.key] = le;
          continue;
        }
        payloadLines.push(
          itemId
            ? { stock_item_id: itemId, quantity: q!, unit_price: p! }
            : { new_item: { name: l.query.trim(), unit: l.newUnit! }, quantity: q!, unit_price: p! },
        );
      }
    }

    let amountMillimes: number | undefined;
    let amountError: string | undefined;
    if (sendLines) {
      if (!Object.keys(lineErrors).length && linesTotal < 1) amountError = "Le total des matières doit être supérieur à 0";
    } else {
      const a = parseMoney(amount);
      if (a === null || a < 1) amountError = "Montant invalide";
      else amountMillimes = a;
    }

    setErrors({ amount: amountError, lines: lineErrors });
    if (amountError || Object.keys(lineErrors).length) return;

    mutation.mutate(
      sendLines
        ? { lines: payloadLines }
        : // Editing to "no lines" must clear any stored lines explicitly.
          { amount: amountMillimes, ...(editing ? { lines: [] } : {}) },
    );
  };

  const usedIds = (exceptKey: string) =>
    new Set(lines.filter((l) => l.key !== exceptKey && l.itemId).map((l) => l.itemId!));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifier la dépense" : presetItem ? `Acheter : ${presetItem.name}` : "Déclarer une dépense"}
      width={isMaterials ? "max-w-3xl" : "max-w-md"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="expense-form" loading={mutation.isPending}>
            {editing ? "Enregistrer les modifications" : sendLines ? `Enregistrer · ${formatMillimes(linesTotal)}` : "Enregistrer"}
          </Button>
        </>
      }
    >
      <form
        id="expense-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={`grid grid-cols-1 gap-4 ${isMaterials ? "sm:grid-cols-[2fr_1fr]" : ""}`}>
          <Selector
            label="Catégorie"
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))}
            value={category}
            onChange={(v) => v && setCategory(v as ExpenseCategory)}
            width="100%"
          />
          <DateInput
            label="Date"
            value={date as IsoDate}
            onChange={(v) => setDate(v ?? todayIso())}
            max={todayIso()}
            format="date"
            width="100%"
          />
        </div>

        {droppedLines > 0 && (
          <Banner
            status="warning"
            title="Cette catégorie n'alimente pas le stock"
            description={
              editing
                ? `${droppedLines} matière(s) seront retirées du stock à l'enregistrement.`
                : `Les ${droppedLines} matière(s) saisies ne seront pas enregistrées.`
            }
          />
        )}

        {isMaterials && (
          <section aria-label="Matières achetées" className="rounded-card border border-border">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Matières achetées</h3>
                <p className="text-xs text-text-secondary">Ajoutées automatiquement au stock à l'enregistrement.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <PackagePlus className="h-4 w-4" />
                Ajouter une ligne
              </Button>
            </header>

            {/* Column heads (desktop) */}
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-3 px-4 pt-3 text-[11px] font-medium uppercase text-text-secondary sm:grid">
              <span>Matière</span>
              <span>Quantité</span>
              <span>Prix unitaire (DT)</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            <ul className="divide-y divide-border sm:divide-y-0">
              {lines.map((l, idx) => {
                const le = errors.lines?.[l.key] ?? {};
                const total = lineTotals.get(l.key);
                const unit = l.unit ?? l.newUnit;
                return (
                  <li
                    key={l.key}
                    className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] sm:items-start"
                  >
                    <div className="col-span-2 sm:col-span-1">
                      <MaterialPicker
                        items={items}
                        value={l.itemId}
                        query={l.query}
                        excludeIds={usedIds(l.key)}
                        invalid={Boolean(le.item)}
                        onQueryChange={(q) => patchLine(l.key, { query: q, itemId: null, unit: null, newUnit: null })}
                        onSelect={(it) => patchLine(l.key, { itemId: it.id, unit: it.unit, newUnit: null, query: it.name })}
                        onCreate={(name) => patchLine(l.key, { itemId: null, unit: null, newUnit: "unit", query: name })}
                      />
                      {l.newUnit && (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-btn border border-primary/30 bg-primary/5 px-2.5 py-1.5">
                          <span className="whitespace-nowrap text-xs text-primary">Nouvelle · unité</span>
                          <select
                            aria-label="Unité de la nouvelle matière"
                            value={l.newUnit}
                            onChange={(e) => patchLine(l.key, { newUnit: e.target.value as StockUnit })}
                            className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            {STOCK_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {STOCK_UNIT_NAMES[u]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {l.itemId && (() => {
                        const it = items.find((i) => i.id === l.itemId);
                        return it ? (
                          <p className="mt-1 text-[11px] text-text-secondary">
                            En stock : {formatQty(it.quantity, it.unit)}
                          </p>
                        ) : null;
                      })()}
                      <FieldError message={le.item} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase text-text-secondary sm:hidden">Quantité</label>
                      <div className="relative">
                        <Input
                          aria-label={`Quantité ligne ${idx + 1}`}
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                          placeholder="0"
                          invalid={Boolean(le.qty)}
                          className={`tabular-nums ${unit ? "pr-14" : ""}`}
                        />
                        {unit && (
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
                            {STOCK_UNIT_LABELS[unit]}
                          </span>
                        )}
                      </div>
                      <FieldError message={le.qty} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase text-text-secondary sm:hidden">Prix unitaire (DT)</label>
                      <Input
                        aria-label={`Prix unitaire ligne ${idx + 1}`}
                        inputMode="decimal"
                        value={l.price}
                        onChange={(e) => patchLine(l.key, { price: e.target.value })}
                        placeholder="0,000"
                        invalid={Boolean(le.price)}
                        className="tabular-nums"
                      />
                      <FieldError message={le.price} />
                    </div>
                    <div className="flex items-center justify-between sm:block sm:pt-2 sm:text-right">
                      <span className="text-[11px] font-medium uppercase text-text-secondary sm:hidden">Total</span>
                      <span className="text-sm font-semibold tabular-nums text-text-primary">
                        {total !== null && total !== undefined ? formatMillimes(total) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-end sm:pt-1">
                      <IconButton
                        label={`Retirer la ligne ${idx + 1}`}
                        tooltip="Retirer la ligne"
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon={Trash2} size="sm" />}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {usedLines.length > 0 ? (
              <footer className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-3">
                <span className="text-sm text-text-secondary">
                  Montant de la dépense ({usedLines.length} matière{usedLines.length > 1 ? "s" : ""})
                </span>
                <span className="text-lg font-bold tabular-nums text-primary">{formatMillimes(linesTotal)}</span>
              </footer>
            ) : (
              <p className="border-t border-border px-4 py-3 text-xs text-text-secondary">
                Aucune matière saisie : la dépense sera enregistrée sans mouvement de stock.
              </p>
            )}
          </section>
        )}

        {!sendLines && (
          <TextInput
            label="Montant (DT)"
            description="Jusqu'à 3 décimales (ex : 12,500)."
            inputMode="decimal"
            placeholder="25,500"
            value={amount}
            onChange={setAmount}
            isRequired
            hasAutoFocus={!isMaterials}
            status={errors.amount ? { type: "error", message: errors.amount } : undefined}
          />
        )}
        {sendLines && <FieldError message={errors.amount} />}

        <TextInput
          label={isMaterials ? "Fournisseur / facture" : "Description / justificatif"}
          isOptional
          placeholder={isMaterials ? "Ex : Fournisseur, n° de facture" : "Ex : Facture STEG novembre"}
          value={note}
          onChange={setNote}
        />

        {errors.form && <Banner status="error" title={errors.form} />}
      </form>
    </Modal>
  );
}
