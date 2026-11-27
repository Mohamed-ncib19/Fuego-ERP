import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { STOCK_UNIT_LABELS, type ManualMovementType, type StockItem } from "@fuego/shared";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Text } from "@astryxdesign/core/Text";
import { Button, Modal } from "@/components/ui";
import { useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { formatQty, fromUnits, todayIso, type IsoDate } from "@/lib/format";

const TYPES: Record<ManualMovementType, { label: string; title: string; hint: string; qtyLabel: string }> = {
  exit: {
    label: "Utiliser",
    title: "Sortie de stock",
    hint: "Matière utilisée en production, perdue ou abîmée.",
    qtyLabel: "Quantité sortie",
  },
  entry: {
    label: "Ajouter",
    title: "Entrée sans achat",
    hint: "Retour, don ou correction. Un achat se déclare avec « Acheter » pour créer sa dépense.",
    qtyLabel: "Quantité ajoutée",
  },
  count: {
    label: "Compter",
    title: "Inventaire",
    hint: "Saisissez la quantité réellement comptée : l'écart est enregistré.",
    qtyLabel: "Quantité comptée",
  },
};

/** Records one stock movement and shows the quantity before and after. */
export function MovementDialog({
  open,
  onClose,
  item,
  initialType = "exit",
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  item: StockItem | null;
  initialType?: ManualMovementType;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const { move } = useStockMutations();
  const [type, setType] = useState<ManualMovementType>(initialType);
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState<IsoDate>(todayIso());
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setType(initialType === "count" && !isAdmin ? "exit" : initialType);
    setQty(null);
    setReason("");
    setDate(todayIso());
    setError(undefined);
  }, [open, initialType, isAdmin]);

  if (!item) return null;
  const parsed = fromUnits(qty);
  const delta =
    parsed === null ? null : type === "entry" ? parsed : type === "exit" ? -parsed : parsed - item.quantity;
  const after = delta === null ? null : item.quantity + delta;

  const validate = (): string | undefined => {
    if (parsed === null) return "Saisissez une quantité";
    if (type !== "count" && parsed <= 0) return "La quantité doit être supérieure à 0";
    if (type === "exit" && parsed > item.quantity)
      return `Stock insuffisant : ${formatQty(item.quantity, item.unit)} disponible`;
    if (type === "count" && delta === 0) return "C'est déjà la quantité en stock";
    return undefined;
  };

  const submit = () => {
    const err = validate();
    setError(err);
    if (err || parsed === null) return;
    move.mutate(
      { id: item.id, payload: { type, quantity: parsed, reason: reason.trim() || undefined, date } },
      {
        onSuccess: () => {
          toast.success(`${item.name} : ${formatQty(after ?? 0, item.unit)} en stock`);
          onClose();
        },
        onError: (e: Error) => setError(e.message),
      },
    );
  };

  const t = TYPES[type];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.name}
      subtitle={`En stock : ${formatQty(item.quantity, item.unit)}`}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={move.isPending}>
            Enregistrer
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
        <SegmentedControl
          label="Type de mouvement"
          value={type}
          onChange={(v) => {
            setType(v as ManualMovementType);
            setError(undefined);
          }}
          layout="fill"
        >
          <SegmentedControlItem value="exit" label={TYPES.exit.label} />
          <SegmentedControlItem value="entry" label={TYPES.entry.label} />
          <SegmentedControlItem
            value="count"
            label={TYPES.count.label}
            isDisabled={!isAdmin}
          />
        </SegmentedControl>
        <Text type="supporting" color="secondary">
          {t.hint}
        </Text>

        <NumberInput
          label={t.qtyLabel}
          value={qty}
          onChange={(v) => {
            setQty(v);
            setError(undefined);
          }}
          min={0}
          step={1}
          units={STOCK_UNIT_LABELS[item.unit]}
          hasAutoFocus
          onEnter={submit}
          status={error ? { type: "error", message: error } : undefined}
          width="100%"
        />

        {after !== null && !error && (
          <div className="flex items-center gap-2 rounded-btn bg-surface-2 px-3 py-2 text-sm">
            <span className="text-text-secondary">Stock</span>
            <span className="tabular-nums">{formatQty(item.quantity, item.unit)}</span>
            <ArrowRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            <span className={`font-semibold tabular-nums ${after < 0 ? "text-danger" : ""}`}>
              {formatQty(after, item.unit)}
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <TextInput
            label="Motif"
            isOptional
            value={reason}
            onChange={setReason}
            placeholder={type === "exit" ? "Ex. commande n° 42" : "Ex. retour fournisseur"}
          />
          <DateInput
            label="Date"
            value={date}
            onChange={(v) => setDate(v ?? todayIso())}
            max={todayIso()}
            format="date"
          />
        </div>
        {!isAdmin && (
          <Text type="supporting" color="secondary">
            L'inventaire (Compter) est réservé à l'administrateur.
          </Text>
        )}
      </form>
    </Modal>
  );
}
