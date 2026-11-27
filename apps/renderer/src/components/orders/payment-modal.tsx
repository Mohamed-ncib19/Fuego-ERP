import { useState, useEffect } from "react";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Banner } from "@astryxdesign/core/Banner";
import { Modal, Button } from "@/components/ui";
import { formatMillimes } from "@/lib/format";
import { ORDER_STATUS_LABELS, type OrderStatus, type PaymentKind } from "@fuego/shared";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { kind: PaymentKind; amount: number; note?: string }) => Promise<void>;
  paidAmount: number;
  remainingAmount: number;
  orderStatus: string;
}

const KIND_OPTIONS: { value: PaymentKind; label: string }[] = [
  { value: "advance", label: "Avance (Acompte)" },
  { value: "balance", label: "Règlement du solde" },
  { value: "refund", label: "Remboursement" },
];

/** DT with three decimals, as on the ticket ("25,500"). */
const dtFormat = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  useGrouping: false,
});

export function PaymentModal({
  open,
  onClose,
  onConfirm,
  paidAmount,
  remainingAmount,
  orderStatus,
}: PaymentModalProps) {
  const isClosed = orderStatus === "delivered" || orderStatus === "cancelled";
  const [kind, setKind] = useState<PaymentKind>(isClosed ? "refund" : "advance");
  /** Amount in DT as the field shows it; converted to millimes on submit. */
  const [amountDt, setAmountDt] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (isClosed) {
        setKind("refund");
        setAmountDt(paidAmount > 0 ? paidAmount / 1000 : null);
      } else {
        setKind(remainingAmount > 0 ? "balance" : "advance");
        setAmountDt(remainingAmount > 0 ? remainingAmount / 1000 : null);
      }
      setNote("");
      setAmountError(null);
      setError(null);
    }
  }, [open, isClosed, paidAmount, remainingAmount]);

  const submit = async () => {
    if (loading) return;
    const parsedDt = amountDt ?? Number.NaN;
    if (Number.isNaN(parsedDt) || parsedDt <= 0) {
      setAmountError("Veuillez saisir un montant valide supérieur à 0");
      return;
    }

    const millimes = Math.round(parsedDt * 1000);
    if (kind === "refund" && millimes > paidAmount) {
      setAmountError(
        `Le remboursement ne peut pas dépasser le montant payé (${formatMillimes(paidAmount)})`,
      );
      return;
    }

    setLoading(true);
    setAmountError(null);
    setError(null);
    try {
      await onConfirm({
        kind,
        amount: millimes,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'enregistrement du paiement");
    } finally {
      setLoading(false);
    }
  };

  const handleFullRefund = () => {
    setKind("refund");
    setAmountDt(paidAmount / 1000);
    setNote("Remboursement intégral");
    setAmountError(null);
    setError(null);
  };

  const statusLabel = ORDER_STATUS_LABELS[orderStatus as OrderStatus]?.toLowerCase() ?? orderStatus;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enregistrer un paiement"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} loading={loading}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {error && <Banner status="error" title={error} />}

        <Selector
          label="Type de transaction"
          options={isClosed ? KIND_OPTIONS.filter((o) => o.value === "refund") : KIND_OPTIONS}
          value={kind}
          onChange={(v) => {
            if (!v) return;
            setKind(v as PaymentKind);
            setAmountError(null);
          }}
          isDisabled={isClosed}
          description={
            isClosed
              ? `Seul le remboursement est autorisé pour une commande ${statusLabel}.`
              : undefined
          }
          width="100%"
        />

        <div className="flex flex-col gap-1.5">
          <NumberInput
            label="Montant"
            units="DT"
            value={amountDt}
            onChange={(v) => {
              setAmountDt(v);
              setAmountError(null);
            }}
            hasClear
            min={0}
            step={1}
            placeholder="Ex. 25,500"
            formatValue={(v) => dtFormat.format(v)}
            isRequired
            hasAutoFocus
            description={`Payé à ce jour : ${formatMillimes(paidAmount)} · Reste à payer : ${formatMillimes(remainingAmount)}`}
            status={amountError ? { type: "error", message: amountError } : undefined}
            width="100%"
          />
          {paidAmount > 0 && kind !== "refund" && (
            <div>
              <Button variant="ghost" size="sm" onClick={handleFullRefund}>
                Rembourser la totalité
              </Button>
            </div>
          )}
        </div>

        <TextInput
          label="Note / Référence"
          isOptional
          placeholder="Ex. Espèces, Virement bancaire #…"
          value={note}
          onChange={setNote}
          width="100%"
        />

        {/* Enter in a field submits, like before. */}
        <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
