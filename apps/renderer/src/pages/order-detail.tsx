import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Printer,
  Edit,
  Check,
  Play,
  CheckCircle2,
  Truck,
  XCircle,
  CreditCard,
  Plus,
  Clock,
  User,
  Phone,
  MapPin,
  Calendar,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Button,
  Card,
  Badge,
  Input,
  PageLoader,
  ConfirmDialog,
  FieldError,
  MoreMenu,
  type MoreMenuItem,
} from "@/components/ui";
import { StatusSteps } from "@/components/orders/status-steps";
import { StatusBadge } from "@/components/orders/status-badge";
import { TypeBadge } from "@/components/orders/type-badge";
import { PaymentModal } from "@/components/orders/payment-modal";
import { ordersApi } from "@/lib/api/orders.api";
import { formatMillimes, formatDate, formatDateTime } from "@/lib/format";
import { useAuthStore } from "@/hooks/use-auth-store";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_EVENT_LABELS,
  formatPhone,
  PAYMENT_KIND_LABELS,
  type PaymentKind,
} from "@fuego/shared";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const toast = useToast();
  const isAdmin = user?.role === "super_admin";

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [forceDeliverOpen, setForceDeliverOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.get(id!),
    enabled: Boolean(id),
  });

  const done = (message: string) => () => {
    queryClient.invalidateQueries({ queryKey: ["order", id] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast.success(message);
    setError(null);
  };

  const mutationOptions = {
    onSuccess: done("Opération réussie"),
    onError: (err: any) => {
      setError(err?.message || "Une erreur est survenue");
      toast.error(err?.message || "Une erreur est survenue");
    },
  };

  const confirmMutation = useMutation({
    mutationFn: () => ordersApi.confirm(id!),
    ...mutationOptions,
    onSuccess: done("Commande confirmée"),
  });

  const startMutation = useMutation({
    mutationFn: () => ordersApi.start(id!),
    ...mutationOptions,
    onSuccess: done("Travail démarré"),
  });

  const readyMutation = useMutation({
    mutationFn: () => ordersApi.ready(id!),
    ...mutationOptions,
    onSuccess: done("Commande prête"),
  });

  const deliverMutation = useMutation({
    mutationFn: ({ force = false }: { force?: boolean }) => ordersApi.deliver(id!, { force }),
    ...mutationOptions,
    onSuccess: done("Commande livrée"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.cancel(id!, { reason: cancelReason }),
    ...mutationOptions,
    onSuccess: () => {
      setCancelModalOpen(false);
      setCancelReason("");
      done("Commande annulée")();
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => ordersApi.addNote(id!, { note: newNote }),
    onSuccess: () => {
      setNewNote("");
      done("Note ajoutée")();
    },
    onError: mutationOptions.onError,
  });

  const handleRecordPayment = async (data: { kind: PaymentKind; amount: number; note?: string }) => {
    await ordersApi.recordPayment(id!, data);
    queryClient.invalidateQueries({ queryKey: ["order", id] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast.success("Paiement enregistré avec succès");
  };

  if (isLoading || !order) {
    return (
      <DashboardShell title="Chargement...">
        <PageLoader />
      </DashboardShell>
    );
  }

  const isClosed = order.status === "delivered" || order.status === "cancelled";
  const canDeliver = order.reste <= 0;

  // What blocks the main button, said in plain words next to it.
  const nextStepHint =
    order.status === "pending" && order.items.length === 0
      ? "Ajoutez au moins un article pour confirmer"
      : order.status === "ready" && !canDeliver
        ? "Le solde doit être réglé avant la livraison"
        : null;

  // Everything that is not the next step lives in the "Plus" menu.
  const moreItems: MoreMenuItem[] = [];
  if (!isClosed) {
    moreItems.push({
      label: "Modifier la commande",
      icon: <Edit className="h-4 w-4" />,
      onClick: () => navigate(`/commandes/${id}/edit`),
    });
    if (order.reste > 0 && !(order.status === "ready" && !canDeliver)) {
      moreItems.push({
        label: "Enregistrer un paiement",
        icon: <CreditCard className="h-4 w-4" />,
        onClick: () => setPaymentModalOpen(true),
      });
    }
  }
  if (order.status !== "delivered") {
    moreItems.push({
      label: "Imprimer le ticket",
      icon: <Printer className="h-4 w-4" />,
      disabled: order.status === "pending",
      hint: order.status === "pending" ? "Disponible après confirmation" : undefined,
      onClick: () => navigate(`/commandes/${id}/ticket`),
    });
  }
  if (order.status === "ready" && !canDeliver && isAdmin) {
    moreItems.push({
      label: "Forcer la livraison",
      icon: <ShieldAlert className="h-4 w-4" />,
      hint: "Admin — livrer malgré un reste à payer",
      danger: true,
      onClick: () => setForceDeliverOpen(true),
    });
  }
  if (!isClosed) {
    moreItems.push({
      label: "Annuler la commande",
      icon: <XCircle className="h-4 w-4" />,
      danger: true,
      onClick: () => setCancelModalOpen(true),
    });
  }

  return (
    <DashboardShell
      title={`Commande ${order.ticket_no}`}
      subtitle={`Créée le ${formatDateTime(order.created_at)}`}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header: back, ONE main action for the next step, the rest in "Plus" */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate("/commandes")}
            className="w-fit gap-2 text-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Toutes les commandes</span>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {nextStepHint && <span className="text-xs text-text-secondary">{nextStepHint}</span>}
            {order.status === "pending" && (
              <Button
                className="px-5"
                loading={confirmMutation.isPending}
                disabled={order.items.length === 0}
                onClick={() => confirmMutation.mutate()}
              >
                <Check className="h-4 w-4" />
                <span>Confirmer la commande</span>
              </Button>
            )}
            {order.status === "confirmed" && (
              <Button
                className="px-5"
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                <Play className="h-4 w-4" />
                <span>Démarrer le travail</span>
              </Button>
            )}
            {order.status === "in_progress" && (
              <Button
                className="px-5"
                loading={readyMutation.isPending}
                onClick={() => readyMutation.mutate()}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Marquer prête</span>
              </Button>
            )}
            {order.status === "ready" &&
              (canDeliver ? (
                <Button
                  className="px-5"
                  loading={deliverMutation.isPending}
                  onClick={() => deliverMutation.mutate({ force: false })}
                >
                  <Truck className="h-4 w-4" />
                  <span>Livrer la commande</span>
                </Button>
              ) : (
                <Button className="px-5" onClick={() => setPaymentModalOpen(true)}>
                  <CreditCard className="h-4 w-4" />
                  <span>Encaisser le solde ({formatMillimes(order.reste)})</span>
                </Button>
              ))}
            {order.status === "delivered" && (
              <Button className="px-5" onClick={() => navigate(`/commandes/${id}/ticket`)}>
                <Printer className="h-4 w-4" />
                <span>Imprimer le ticket</span>
              </Button>
            )}
            <MoreMenu items={moreItems} />
          </div>
        </div>

        <StatusSteps status={order.status} />

        {error && <FieldError message={error} />}

        {/* Top Overview Cards Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Customer & Order details */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Détails Commande
              </span>
              <div className="flex items-center gap-1.5">
                <TypeBadge orderType={order.order_type} />
                <StatusBadge status={order.status} />
              </div>
            </div>

            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-text-primary">
                <User className="h-4 w-4 text-text-secondary" />
                <span>{order.customer_name || "Sans nom (Brouillon)"}</span>
              </p>
              {order.customer_phone && (
                <p className="flex items-center gap-2 text-xs text-text-secondary">
                  <Phone className="h-3.5 w-3.5 text-text-secondary" />
                  <span>{formatPhone(order.customer_phone)}</span>
                </p>
              )}
              {order.order_type === "online" && (
                <p className="flex items-start gap-2 text-xs text-text-secondary">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary" />
                  <span>{order.delivery_address || "Adresse non renseignée"}</span>
                </p>
              )}
              {order.due_date && (
                <p className="flex items-center gap-2 text-xs text-text-secondary">
                  <Calendar className="h-3.5 w-3.5 text-text-secondary" />
                  <span>Prévu pour le {formatDate(order.due_date)}</span>
                </p>
              )}
              {order.description && (
                <p className="mt-2 rounded-card bg-surface-2 p-2.5 text-xs text-text-secondary">
                  {order.description}
                </p>
              )}
            </div>
          </Card>

          {/* Money Overview */}
          <Card className="p-5 md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Synthèse Financière
              </span>
              <Button
                variant="secondary"
                className="h-8 px-3 text-xs"
                onClick={() => setPaymentModalOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Enregistrer un paiement</span>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-card bg-surface-2 p-3">
                <p className="text-xs text-text-secondary">Articles</p>
                <p className="mt-1 text-base font-bold text-text-primary">
                  {formatMillimes(order.total_amount)}
                </p>
                <p className="text-[10px] text-text-secondary">{order.items.length} article(s)</p>
              </div>

              <div className="rounded-card bg-surface-2 p-3">
                <p className="text-xs text-text-secondary">Livraison</p>
                <p className="mt-1 text-base font-bold text-text-primary">
                  {formatMillimes(order.delivery_fee)}
                </p>
                <p className="text-[10px] text-text-secondary">{order.order_type === "online" ? "En ligne" : "Gratuit (Local)"}</p>
              </div>

              <div className="rounded-card bg-surface-2 p-3">
                <p className="text-xs text-text-secondary">Payé à ce jour</p>
                <p className="mt-1 text-base font-bold text-success">
                  {formatMillimes(order.paid)}
                </p>
                <p className="text-[10px] text-text-secondary">{order.payments.length} versement(s)</p>
              </div>

              <div className={`rounded-card p-3 ${
                order.reste > 0
                  ? "bg-warning/10 border border-warning/30"
                  : order.reste < 0
                  ? "bg-info/10 border border-info/30"
                  : "bg-success/10 border border-success/30"
              }`}>
                <p className="text-xs text-text-secondary">
                  {order.reste < 0 ? "Trop-perçu" : "Reste à payer"}
                </p>
                <p className={`mt-1 text-base font-bold ${
                  order.reste > 0 ? "text-warning" : order.reste < 0 ? "text-info" : "text-success"
                }`}>
                  {formatMillimes(Math.abs(order.reste))}
                </p>
                <p className="text-[10px] text-text-secondary">
                  {order.reste <= 0 ? "Soldé" : "En attente de règlement"}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Articles Table */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Articles commandés ({order.items.length})
            </h2>
            {!isClosed && (
              <Button
                variant="ghost"
                className="h-8 text-xs text-primary"
                onClick={() => navigate(`/commandes/${id}/edit`)}
              >
                Modifier les articles
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-text-secondary">
                <tr>
                  <th className="py-2.5 font-semibold">#</th>
                  <th className="py-2.5 font-semibold">Article</th>
                  <th className="py-2.5 font-semibold">Quantité</th>
                  <th className="py-2.5 font-semibold">Prix unitaire</th>
                  <th className="py-2.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {order.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-secondary">
                      Aucun article dans cette commande.
                    </td>
                  </tr>
                ) : (
                  order.items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="py-2.5 text-xs text-text-secondary">{index + 1}</td>
                      <td className="py-2.5 font-medium text-text-primary">{item.label}</td>
                      <td className="py-2.5">{item.quantity}</td>
                      <td className="py-2.5 text-text-secondary">{formatMillimes(item.unit_price)}</td>
                      <td className="py-2.5 text-right font-medium text-text-primary">
                        {formatMillimes(item.quantity * item.unit_price)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Payments Ledger Table */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Livre des paiements & acomptes
            </h2>
            <Button
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={() => setPaymentModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nouveau versement</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-text-secondary">
                <tr>
                  <th className="py-2.5 font-semibold">Date & Heure</th>
                  <th className="py-2.5 font-semibold">Type</th>
                  <th className="py-2.5 font-semibold">Enregistré par</th>
                  <th className="py-2.5 font-semibold">Note</th>
                  <th className="py-2.5 text-right font-semibold">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {order.payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-secondary">
                      Aucun paiement enregistré pour le moment.
                    </td>
                  </tr>
                ) : (
                  order.payments.map((p) => {
                    const isRefund = p.kind === "refund";
                    return (
                      <tr key={p.id}>
                        <td className="py-2.5 text-xs text-text-secondary">
                          {formatDateTime(p.created_at)}
                        </td>
                        <td className="py-2.5">
                          <Badge tone={isRefund ? "danger" : "success"}>
                            {PAYMENT_KIND_LABELS[p.kind] || p.kind}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-xs text-text-secondary">
                          {p.recorded_by_label}
                        </td>
                        <td className="py-2.5 text-xs text-text-secondary">
                          {p.note || "—"}
                        </td>
                        <td className={`py-2.5 text-right font-semibold ${isRefund ? "text-danger" : "text-success"}`}>
                          {isRefund ? "-" : "+"}{formatMillimes(p.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Timeline Events & Notes */}
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Historique & Journal d'événements
          </h2>

          {/* Add note input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newNote.trim()) noteMutation.mutate();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Ajouter une note ou instruction interne..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <Button
              variant="secondary"
              type="submit"
              disabled={!newNote.trim() || noteMutation.isPending}
              loading={noteMutation.isPending}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Ajouter</span>
            </Button>
          </form>

          {/* Timeline stream */}
          <div className="mt-4 space-y-3">
            {order.events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-3 rounded-card border border-border/60 bg-surface-2/30 p-3 text-xs"
              >
                <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary">
                      {ORDER_EVENT_LABELS[ev.type] || ev.type}
                    </span>
                    <span className="text-text-secondary">{formatDateTime(ev.created_at)}</span>
                  </div>
                  <p className="text-text-secondary">
                    Par <span className="font-medium text-text-primary">{ev.actor_label}</span>
                  </p>
                  {ev.payload && (
                    <p className="mt-1 rounded bg-surface p-2 font-mono text-[11px] text-text-secondary">
                      {ev.payload}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onConfirm={handleRecordPayment}
        paidAmount={order.paid}
        remainingAmount={order.reste}
        orderStatus={order.status}
      />

      {/* Cancellation Confirmation Dialog */}
      <ConfirmDialog
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Annuler la commande"
        message="Êtes-vous sûr de vouloir annuler cette commande ? Les versements existants devront faire l'objet d'un remboursement si nécessaire."
        confirmLabel="Confirmer l'annulation"
        danger
      />

      {/* Admin Force Delivery Dialog */}
      <ConfirmDialog
        open={forceDeliverOpen}
        onClose={() => setForceDeliverOpen(false)}
        onConfirm={() => {
          setForceDeliverOpen(false);
          deliverMutation.mutate({ force: true });
        }}
        title="Forcer la livraison (Super Admin)"
        message={`Le client a un reste à payer de ${formatMillimes(order.reste)}. Êtes-vous sûr de vouloir marquer cette commande comme Livrée sans solder le compte ? Cet événement sera audité.`}
        confirmLabel="Forcer la livraison"
        danger
      />
    </DashboardShell>
  );
}
