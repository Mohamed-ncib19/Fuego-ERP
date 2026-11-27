import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck } from "lucide-react";
import { STOCK_UNIT_LABELS, type ManualMovementType, type StockItem } from "@fuego/shared";
import { Button, FieldError, Input, Label, Modal } from "@/components/ui";
import { useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { formatQty, formatSignedQty, parseScaled, todayIso } from "@/lib/format";

const TYPES: Array<{
  value: ManualMovementType;
  label: string;
  hint: string;
  icon: typeof ArrowDownToLine;
  adminOnly?: boolean;
}> = [
  { value: "entry", label: "Entrée", hint: "Réception hors dépense (retour, don…)", icon: ArrowDownToLine },
  { value: "exit", label: "Sortie", hint: "Consommation, perte, casse", icon: ArrowUpFromLine },
  {
    value: "count",
    label: "Inventaire",
    hint: "Saisir la quantité réellement comptée",
    icon: ClipboardCheck,
    adminOnly: true,
  },
];

/** Records one manual movement and previews the resulting quantity. */
export function MovementModal({
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
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setType(initialType === "count" && !isAdmin ? "exit" : initialType);
    setQty("");
    setReason("");
    setDate(todayIso());
    setError(undefined);
  }, [open, initialType, isAdmin]);

  if (!item) return null;
  const unit = STOCK_UNIT_LABELS[item.unit];
  const parsed = qty.trim() ? parseScaled(qty) : null;
  const delta =
    parsed === null ? null : type === "entry" ? parsed : type === "exit" ? -parsed : parsed - item.quantity;
  const after = delta === null ? null : item.quantity + delta;

  const validate = (): string | undefined => {
    if (parsed === null) return qty.trim() ? "Nombre invalide (3 décimales max.)" : "Saisissez une quantité";
    if (type !== "count" && parsed <= 0) return "La quantité doit être supérieure à 0";
    if (type === "exit" && parsed > item.quantity)
      return `Stock insuffisant : ${formatQty(item.quantity, item.unit)} disponible(s)`;
    if (type === "count" && delta === 0) return "Identique au stock actuel — rien à corriger";
    return undefined;
  };

  const submit = () => {
    const err = validate();
    setError(err);
    if (err || parsed === null) return;
    move.mutate(
      { id: item.id, payload: { type, quantity: parsed, reason: reason.trim() || undefined, date } },
      {
        onSuccess: (m) => {
          toast.success(`${item.name} : ${formatSignedQty(m.quantity, item.unit)}`);
          onClose();
        },
        onError: (e: Error) => setError(e.message),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={`Mouvement — ${item.name}`} width="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Type de mouvement">
          {TYPES.filter((t) => !t.adminOnly || isAdmin).map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => {
                setType(t.value);
                setError(undefined);
              }}
              className={`flex flex-col items-start gap-1 rounded-btn border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                type === t.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <t.icon className="h-4 w-4" />
                {t.label}
              </span>
              <span className="text-[11px] leading-tight text-text-secondary">{t.hint}</span>
            </button>
          ))}
        </div>

        <div>
          <Label htmlFor="mv-qty">
            {type === "count" ? `Quantité comptée (${unit})` : `Quantité (${unit})`}
          </Label>
          <Input
            id="mv-qty"
            inputMode="decimal"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setError(undefined);
            }}
            placeholder="0"
            invalid={Boolean(error)}
            autoFocus
            className="text-base tabular-nums"
          />
          <FieldError message={error} />
        </div>

        {/* Before → after preview: the number the person is about to create. */}
        <div className="flex items-center justify-between rounded-btn border border-border bg-surface-2 px-4 py-3 text-sm">
          <div>
            <p className="text-xs text-text-secondary">Actuel</p>
            <p className="font-semibold tabular-nums text-text-primary">{formatQty(item.quantity, item.unit)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-secondary">Mouvement</p>
            <p
              className={`font-semibold tabular-nums ${
                delta === null || delta === 0 ? "text-text-secondary" : delta > 0 ? "text-success" : "text-danger"
              }`}
            >
              {delta === null ? "—" : formatSignedQty(delta, item.unit)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-secondary">Après</p>
            <p
              className={`font-semibold tabular-nums ${
                after !== null && after < 0 ? "text-danger" : "text-text-primary"
              }`}
            >
              {after === null ? "—" : formatQty(after, item.unit)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="mv-reason">Motif (optionnel)</Label>
            <Input
              id="mv-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={type === "exit" ? "Ex : Commande CMD-2026-0042" : "Ex : Retour fournisseur"}
            />
          </div>
          <div>
            <Label htmlFor="mv-date">Date</Label>
            <Input id="mv-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={move.isPending}>
            Enregistrer le mouvement
          </Button>
        </div>
      </form>
    </Modal>
  );
}
