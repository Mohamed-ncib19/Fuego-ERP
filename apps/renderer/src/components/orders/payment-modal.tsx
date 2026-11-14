import { useState, useEffect } from "react";
import { Modal, Button, Input, Select, Label, FieldError } from "@/components/ui";
import { formatMillimes } from "@/lib/format";
import type { PaymentKind } from "@fuego/shared";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { kind: PaymentKind; amount: number; note?: string }) => Promise<void>;
  paidAmount: number;
  remainingAmount: number;
  orderStatus: string;
}

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
  const [amountDt, setAmountDt] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (isClosed) {
        setKind("refund");
        setAmountDt(paidAmount > 0 ? (paidAmount / 1000).toFixed(3) : "");
      } else {
        setKind(remainingAmount > 0 ? "balance" : "advance");
        setAmountDt(remainingAmount > 0 ? (remainingAmount / 1000).toFixed(3) : "");
      }
      setNote("");
      setError(null);
    }
  }, [open, isClosed, paidAmount, remainingAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDt = parseFloat(amountDt.replace(",", "."));
    if (Number.isNaN(parsedDt) || parsedDt <= 0) {
      setError("Veuillez saisir un montant valide supérieur à 0");
      return;
    }

    const millimes = Math.round(parsedDt * 1000);
    if (kind === "refund" && millimes > paidAmount) {
      setError(`Le remboursement ne peut pas dépasser le montant payé (${formatMillimes(paidAmount)})`);
      return;
    }

    setLoading(true);
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
    setAmountDt((paidAmount / 1000).toFixed(3));
    setNote("Remboursement intégral");
    setError(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Enregistrer un paiement">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <FieldError message={error} />}

        <div>
          <Label>Type de transaction</Label>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as PaymentKind)}
            disabled={isClosed}
          >
            {!isClosed && <option value="advance">Avance (Acompte)</option>}
            {!isClosed && <option value="balance">Règlement du solde</option>}
            <option value="refund">Remboursement</option>
          </Select>
          {isClosed && (
            <p className="mt-1 text-xs text-text-secondary">
              Seul le remboursement est autorisé pour une commande {orderStatus}.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Montant (en Dinars - DT)</Label>
            {paidAmount > 0 && kind !== "refund" && (
              <button
                type="button"
                onClick={handleFullRefund}
                className="text-xs text-primary hover:underline"
              >
                Rembourser la totalité
              </button>
            )}
          </div>
          <Input
            type="number"
            step="0.001"
            min="0.001"
            placeholder="Ex: 25.500"
            value={amountDt}
            onChange={(e) => setAmountDt(e.target.value)}
            required
          />
          <div className="mt-1 flex items-center justify-between text-xs text-text-secondary">
            <span>Payé à ce jour: {formatMillimes(paidAmount)}</span>
            <span>Reste à payer: {formatMillimes(remainingAmount)}</span>
          </div>
        </div>

        <div>
          <Label>Note / Référence (optionnel)</Label>
          <Input
            type="text"
            placeholder="Ex: Espèces, Virement bancaire #..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
