import { useEffect, useState } from "react";
import {
  STOCK_ITEM_KINDS,
  STOCK_ITEM_KIND_LABELS,
  STOCK_UNITS,
  STOCK_UNIT_LABELS,
  STOCK_UNIT_NAMES,
  type StockItem,
  type StockItemKind,
  type StockUnit,
} from "@fuego/shared";
import { Button, FieldError, Input, Label, Modal, Select } from "@/components/ui";
import { useStockCategories, useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { parseScaled, scaledToInput } from "@/lib/format";

/**
 * Create or edit a stock item. Quantity is not editable here: after
 * creation it only changes through movements, so the history explains it.
 */
export function ItemFormModal({
  open,
  onClose,
  item,
  defaultKind = "raw_material",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit mode when set. */
  item?: StockItem | null;
  defaultKind?: StockItemKind;
  onSaved?: (item: StockItem) => void;
}) {
  const toast = useToast();
  const { create, update } = useStockMutations();
  const { data: categories = [] } = useStockCategories();
  const editing = Boolean(item);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<StockItemKind>(defaultKind);
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState<StockUnit>("unit");
  const [threshold, setThreshold] = useState("");
  const [initial, setInitial] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setKind(item?.kind ?? defaultKind);
    setCategory(item?.category ?? "");
    setUnit(item?.unit ?? "unit");
    setThreshold(item && item.min_threshold > 0 ? scaledToInput(item.min_threshold) : "");
    setInitial("");
    setNote(item?.note ?? "");
    setErrors({});
  }, [open, item, defaultKind]);

  const unitLocked = editing && (item?.movements_count ?? 0) > 0;
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Le nom est obligatoire";
    const thr = threshold.trim() ? parseScaled(threshold) : 0;
    if (thr === null) errs.threshold = "Nombre invalide (3 décimales max.)";
    const init = initial.trim() ? parseScaled(initial) : 0;
    if (init === null) errs.initial = "Nombre invalide (3 décimales max.)";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const base = {
      name: name.trim(),
      kind,
      category: category.trim(),
      unit,
      min_threshold: thr ?? 0,
      note: note.trim(),
    };
    const done = (saved: StockItem) => {
      toast.success(editing ? "Article mis à jour" : `« ${saved.name} » ajouté au stock`);
      onSaved?.(saved);
      onClose();
    };
    const fail = (err: Error) => {
      if (/existe déjà/.test(err.message)) setErrors({ name: err.message });
      else toast.error(err.message);
    };

    if (editing && item) {
      const payload = unitLocked ? { ...base, unit: undefined } : base;
      update.mutate({ id: item.id, payload }, { onSuccess: done, onError: fail });
    } else {
      create.mutate({ ...base, initial_quantity: init ?? 0 }, { onSuccess: done, onError: fail });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Modifier « ${item?.name} »` : "Nouvel article de stock"}
      width="max-w-lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <Label htmlFor="si-name">Nom</Label>
          <Input
            id="si-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Tissu coton blanc"
            invalid={Boolean(errors.name)}
            autoFocus
          />
          <FieldError message={errors.name} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="si-kind">Type</Label>
            <Select id="si-kind" value={kind} onChange={(e) => setKind(e.target.value as StockItemKind)}>
              {STOCK_ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {STOCK_ITEM_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="si-cat">Catégorie (optionnel)</Label>
            <Input
              id="si-cat"
              list="stock-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex : Tissus"
            />
            <datalist id="stock-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="si-unit">Unité de mesure</Label>
            <Select
              id="si-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as StockUnit)}
              disabled={unitLocked}
            >
              {STOCK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {STOCK_UNIT_NAMES[u]}
                </option>
              ))}
            </Select>
            {unitLocked && (
              <p className="mt-1 text-xs text-text-secondary">
                Verrouillée : l'article a déjà des mouvements.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="si-thr">Seuil d'alerte ({STOCK_UNIT_LABELS[unit]})</Label>
            <Input
              id="si-thr"
              inputMode="decimal"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="0 = pas d'alerte"
              invalid={Boolean(errors.threshold)}
            />
            <FieldError message={errors.threshold} />
          </div>
        </div>

        {!editing && (
          <div>
            <Label htmlFor="si-init">Quantité initiale en stock ({STOCK_UNIT_LABELS[unit]})</Label>
            <Input
              id="si-init"
              inputMode="decimal"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              placeholder="0"
              invalid={Boolean(errors.initial)}
            />
            <FieldError message={errors.initial} />
            <p className="mt-1 text-xs text-text-secondary">
              Enregistrée comme mouvement « Stock initial ». Les achats passent ensuite par les dépenses.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="si-note">Note (optionnel)</Label>
          <Input
            id="si-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Fournisseur habituel, référence…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={pending}>
            {editing ? "Enregistrer" : "Ajouter"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
