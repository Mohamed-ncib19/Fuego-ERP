import { useEffect, useState } from "react";
import {
  STOCK_UNITS,
  STOCK_UNIT_LABELS,
  STOCK_UNIT_NAMES,
  stockLineTotal,
  type StockItem,
  type StockUnit,
} from "@fuego/shared";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Banner } from "@astryxdesign/core/Banner";
import { Token } from "@astryxdesign/core/Token";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { Button, Modal } from "@/components/ui";
import { useStockCategories, useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { formatMillimes, formatQty, fromUnits, todayIso, toUnits, type IsoDate } from "@/lib/format";

const UNIT_OPTIONS = STOCK_UNITS.map((u) => ({ value: u, label: STOCK_UNIT_NAMES[u] }));

type Errors = Partial<Record<"name" | "qty" | "price" | "form", string>>;

/**
 * Create or edit a material. On creation a starting quantity is a purchase:
 * the server books the item, its "Matières & Fournitures" dépense and the
 * stock entry together. "Déjà en ma possession" records it as opening stock
 * with no dépense. After creation the quantity only changes through
 * movements, so its history always explains it.
 */
export function MaterialDialog({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit mode when set. */
  item?: StockItem | null;
}) {
  const toast = useToast();
  const { create, update } = useStockMutations();
  const { data: categories = [] } = useStockCategories();
  const editing = Boolean(item);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<StockUnit>("unit");
  const [category, setCategory] = useState("");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [qty, setQty] = useState<number | null>(null);
  const [owned, setOwned] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState<IsoDate>(todayIso());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setUnit(item?.unit ?? "unit");
    setCategory(item?.category ?? "");
    setThreshold(item && item.min_threshold > 0 ? toUnits(item.min_threshold) : null);
    setQty(null);
    setOwned(false);
    setPrice(null);
    setSupplier("");
    setDate(todayIso());
    setNote(item?.note ?? "");
    setErrors({});
  }, [open, item]);

  const qtyScaled = fromUnits(qty) ?? 0;
  const priceMillimes = fromUnits(price);
  const isPurchase = !editing && qtyScaled > 0 && !owned;
  const total = isPurchase && priceMillimes ? stockLineTotal(qtyScaled, priceMillimes) : null;
  const unitLabel = STOCK_UNIT_LABELS[unit];
  const unitLocked = editing && (item?.movements_count ?? 0) > 0;
  const pending = create.isPending || update.isPending;

  const validate = (): Errors => {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = "Donnez un nom (2 caractères minimum)";
    if (isPurchase && (!priceMillimes || priceMillimes < 1))
      e.price = "Indiquez le prix d'achat, ou cochez « Déjà en ma possession »";
    return e;
  };

  const submit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const base = {
      name: name.trim(),
      unit,
      category: category.trim() || undefined,
      min_threshold: fromUnits(threshold) ?? 0,
      note: note.trim() || undefined,
    };
    const onError = (err: Error) => setErrors({ form: err.message });

    if (editing && item) {
      update.mutate(
        { id: item.id, payload: { ...base, category: category.trim(), note: note.trim() } },
        {
          onSuccess: () => {
            toast.success(`« ${base.name} » mis à jour`);
            onClose();
          },
          onError,
        },
      );
      return;
    }

    create.mutate(
      {
        ...base,
        kind: "raw_material",
        initial_quantity: qtyScaled || undefined,
        already_owned: qtyScaled > 0 && owned ? true : undefined,
        unit_price: isPurchase ? (priceMillimes ?? undefined) : undefined,
        purchase_date: isPurchase ? date : undefined,
        supplier: isPurchase ? supplier.trim() || undefined : undefined,
      },
      {
        onSuccess: ({ item: created, expense }) => {
          toast.success(
            expense
              ? `« ${created.name} » ajouté · dépense de ${formatMillimes(expense.amount)} enregistrée`
              : `« ${created.name} » ajouté au stock`,
          );
          onClose();
        },
        onError,
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifier la matière" : "Nouvelle matière"}
      subtitle={editing ? item?.name : "Matière première ou fourniture que vous achetez"}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={pending}>
            {editing ? "Enregistrer" : isPurchase ? "Ajouter et enregistrer l'achat" : "Ajouter"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {errors.form && <Banner status="error" title={errors.form} />}

        <TextInput
          label="Nom"
          value={name}
          onChange={(v) => {
            setName(v);
            setErrors((x) => ({ ...x, name: undefined, form: undefined }));
          }}
          placeholder="Ex. Tissu coton, Fil polyester"
          isRequired
          hasAutoFocus
          status={errors.name ? { type: "error", message: errors.name } : undefined}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Selector
            label="Unité"
            options={UNIT_OPTIONS}
            value={unit}
            onChange={(v) => v && setUnit(v as StockUnit)}
            hasSearch
            searchPlaceholder="Rechercher une unité"
            isDisabled={unitLocked}
            disabledMessage="L'unité ne change plus une fois que l'article a des mouvements"
            width="100%"
          />
          <NumberInput
            label="Seuil d'alerte"
            isOptional
            value={threshold}
            onChange={setThreshold}
            min={0}
            units={unitLabel}
            labelTooltip="Fuego signale l'article « Stock bas » quand la quantité descend à ce niveau."
            width="100%"
          />
        </div>

        <div className="flex flex-col gap-2">
          <TextInput
            label="Catégorie"
            isOptional
            value={category}
            onChange={setCategory}
            placeholder="Ex. Tissus, Emballages"
          />
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Catégories existantes">
              {categories
                .filter((c) => c !== category)
                .slice(0, 8)
                .map((c) => (
                  <Token key={c} label={c} size="sm" onClick={() => setCategory(c)} />
                ))}
            </div>
          )}
        </div>

        {!editing && (
          <>
            <Divider />
            <Heading level={3}>Stock de départ</Heading>
            <NumberInput
              label="Quantité"
              isOptional
              description="Laissez vide si vous n'en avez pas encore."
              value={qty}
              onChange={(v) => {
                setQty(v);
                setErrors((x) => ({ ...x, price: undefined }));
              }}
              min={0}
              units={unitLabel}
              width="100%"
            />

            {qtyScaled > 0 && (
              <>
                <CheckboxInput
                  label="Déjà en ma possession (pas d'achat)"
                  description="Pour le stock que vous aviez avant Fuego : aucune dépense n'est créée."
                  value={owned}
                  onChange={setOwned}
                />

                {!owned && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumberInput
                      label={`Prix d'achat par ${unitLabel}`}
                      value={price}
                      onChange={(v) => {
                        setPrice(v);
                        setErrors((x) => ({ ...x, price: undefined }));
                      }}
                      min={0}
                      units="DT"
                      isRequired
                      status={errors.price ? { type: "error", message: errors.price } : undefined}
                      width="100%"
                    />
                    <DateInput
                      label="Date d'achat"
                      value={date}
                      onChange={(v) => setDate(v ?? todayIso())}
                      max={todayIso()}
                      format="date"
                      width="100%"
                    />
                    <div className="sm:col-span-2">
                      <TextInput
                        label="Fournisseur / facture"
                        isOptional
                        value={supplier}
                        onChange={setSupplier}
                        placeholder="Apparaît comme note de la dépense"
                      />
                    </div>
                  </div>
                )}

                <Banner
                  status={owned ? "info" : "success"}
                  title={
                    owned
                      ? `${formatQty(qtyScaled, unit)} ajouté(s) au stock, sans dépense.`
                      : total
                        ? `Dépense « Matières & Fournitures » de ${formatMillimes(total)} ajoutée aux finances.`
                        : "Une dépense « Matières & Fournitures » sera ajoutée aux finances."
                  }
                  description={
                    owned
                      ? undefined
                      : `${formatQty(qtyScaled, unit)}${priceMillimes ? ` × ${formatMillimes(priceMillimes)}` : ""} · entrée en stock automatique`
                  }
                />
              </>
            )}
          </>
        )}

        <TextArea label="Note" isOptional value={note} onChange={setNote} rows={2} />
      </form>
    </Modal>
  );
}
