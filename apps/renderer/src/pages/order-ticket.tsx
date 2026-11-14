import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft, Flame } from "lucide-react";
import { Button, PageLoader } from "@/components/ui";
import { ordersApi } from "@/lib/api/orders.api";
import { settingsApi } from "@/lib/api/auth.api";
import { formatMillimes, formatDate, formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@fuego/shared";

export default function OrderTicketPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: order, isLoading: isOrderLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.get(id!),
    enabled: Boolean(id),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.get(),
  });

  const handlePrint = () => {
    window.print();
  };

  if (isOrderLoading || !order) {
    return <PageLoader />;
  }

  const businessName = settings?.business_name || "Fuego";
  const footerMessage =
    settings?.ticket_footer ||
    "Merci pour votre confiance ! Pour toute réclamation, veuillez présenter ce ticket.";

  return (
    <div className="min-h-screen bg-surface-2 p-4 md:p-8 print:m-0 print:bg-white print:p-0">
      {/* Non-printable action toolbar */}
      <div className="mx-auto mb-6 flex max-w-[210mm] items-center justify-between print:hidden">
        <Button
          variant="secondary"
          onClick={() => navigate(`/commandes/${id}`)}
          className="gap-2 text-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Retour à la commande</span>
        </Button>

        <Button variant="primary" onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          <span>Imprimer le ticket (A4)</span>
        </Button>
      </div>

      {/* Printable A4 Paper Sheet */}
      <div className="mx-auto w-full max-w-[210mm] border border-border bg-white p-8 text-neutral-900 shadow-card print:border-none print:p-0 print:shadow-none">
        {/* Ticket Header */}
        <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Flame className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight">{businessName}</h1>
              <p className="text-xs text-neutral-600">Bon de Commande & Reçu de Paiement</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-black tracking-wide text-neutral-900">
              {order.ticket_no}
            </p>
            <p className="text-xs text-neutral-600">
              Émis le {formatDateTime(order.created_at)}
            </p>
            <div className="mt-1 inline-block rounded border border-neutral-300 px-2 py-0.5 text-xs font-semibold">
              Statut: {ORDER_STATUS_LABELS[order.status] || order.status}
            </div>
          </div>
        </div>

        {/* Client & Delivery Info */}
        <div className="my-6 grid grid-cols-2 gap-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs">
          <div>
            <h2 className="mb-1 font-bold uppercase tracking-wider text-neutral-500">
              Informations Client
            </h2>
            <p className="text-sm font-bold text-neutral-900">
              {order.customer_name || "Client comptoir"}
            </p>
            {order.customer_phone && (
              <p className="text-neutral-700">Tél: {order.customer_phone}</p>
            )}
            {order.description && (
              <p className="mt-1 italic text-neutral-600">"{order.description}"</p>
            )}
          </div>
          <div className="text-right">
            <h2 className="mb-1 font-bold uppercase tracking-wider text-neutral-500">
              Modalités de Réception
            </h2>
            <p className="text-sm font-bold text-neutral-900">
              {ORDER_TYPE_LABELS[order.order_type] || order.order_type}
            </p>
            {order.order_type === "online" && order.delivery_address && (
              <p className="text-neutral-700">Adresse: {order.delivery_address}</p>
            )}
            {order.due_date && (
              <p className="mt-1 font-semibold text-neutral-900">
                Date promise: {formatDate(order.due_date)}
              </p>
            )}
          </div>
        </div>

        {/* Articles Table */}
        <div className="my-6">
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-neutral-900 uppercase">
              <tr>
                <th className="py-2.5 font-bold">#</th>
                <th className="py-2.5 font-bold">Désignation</th>
                <th className="py-2.5 text-center font-bold">Quantité</th>
                <th className="py-2.5 text-right font-bold">Prix Unitaire</th>
                <th className="py-2.5 text-right font-bold">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {order.items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="py-2.5 text-neutral-500">{idx + 1}</td>
                  <td className="py-2.5 font-medium text-neutral-900">{it.label}</td>
                  <td className="py-2.5 text-center">{it.quantity}</td>
                  <td className="py-2.5 text-right">{formatMillimes(it.unit_price)}</td>
                  <td className="py-2.5 text-right font-bold">
                    {formatMillimes(it.quantity * it.unit_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Recap Block */}
        <div className="my-6 flex justify-end">
          <div className="w-72 space-y-1.5 rounded-lg border border-neutral-300 p-4 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Total Articles:</span>
              <span className="font-semibold text-neutral-900">
                {formatMillimes(order.total_amount)}
              </span>
            </div>
            {order.order_type === "online" && (
              <div className="flex justify-between text-neutral-600">
                <span>Frais de livraison:</span>
                <span className="font-semibold text-neutral-900">
                  {formatMillimes(order.delivery_fee)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-sm font-black text-neutral-900">
              <span>TOTAL COMMANDE:</span>
              <span>{formatMillimes(order.grand_total)}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Versements / Avance reçue:</span>
              <span className="font-bold text-neutral-900">{formatMillimes(order.paid)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-neutral-900 pt-1.5 text-sm font-black">
              <span>{order.reste < 0 ? "TROP-PERÇU:" : "RESTE À PAYER:"}</span>
              <span className={order.reste > 0 ? "text-neutral-900" : ""}>
                {formatMillimes(Math.abs(order.reste))}
              </span>
            </div>
          </div>
        </div>

        {/* Payments Breakdown */}
        {order.payments.length > 0 && (
          <div className="my-6 border-t border-neutral-200 pt-4 text-[11px] text-neutral-600">
            <p className="font-bold uppercase tracking-wider text-neutral-500 mb-2">
              Détail des règlements enregistrés:
            </p>
            <div className="space-y-1">
              {order.payments.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>
                    • {formatDate(p.created_at)} — {p.kind === "advance" ? "Avance" : p.kind === "balance" ? "Solde" : "Remboursement"}
                    {p.note ? ` (${p.note})` : ""}
                  </span>
                  <span className="font-semibold text-neutral-900">{formatMillimes(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ticket Footer */}
        <div className="mt-12 border-t border-neutral-300 pt-4 text-center text-xs text-neutral-500">
          <p className="font-medium text-neutral-700">{footerMessage}</p>
          <p className="mt-1 text-[10px]">Document généré par Fuego ERP</p>
        </div>
      </div>
    </div>
  );
}
