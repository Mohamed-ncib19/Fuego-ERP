import { useMemo, useState, type ReactNode } from "react";
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
  MessageSquare,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Card } from "@astryxdesign/core/Card";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Button,
  PageLoader,
  ErrorState,
  ConfirmDialog,
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
  type OrderItem,
  type Payment,
  type PaymentKind,
} from "@fuego/shared";

type ItemRow = OrderItem & { index: number } & Record<string, unknown>;
type PaymentRow = Payment & Record<string, unknown>;

const lucide = (icon: LucideIcon) => <Icon icon={icon} size="sm" />;

/** Section title with an optional action on the right. */
function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Heading level={3}>{title}</Heading>
      {action}
    </div>
  );
}

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

  const orderQ = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.get(id!),
    enabled: Boolean(id),
  });
  const { data: order, isLoading } = orderQ;

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

  const itemColumns = useMemo<TableColumn<ItemRow>[]>(
    () => [
      {
        key: "index",
        header: "#",
        width: pixel(56),
        renderCell: (it) => (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {it.index}
          </Text>
        ),
      },
      {
        key: "label",
        header: "Article",
        width: proportional(3),
        renderCell: (it) => <span className="font-medium text-text-primary">{it.label}</span>,
      },
      {
        key: "quantity",
        header: "Quantité",
        width: pixel(110),
        align: "end",
        renderCell: (it) => <span className="tabular-nums">{it.quantity}</span>,
      },
      {
        key: "unit_price",
        header: "Prix unitaire",
        width: pixel(150),
        align: "end",
        renderCell: (it) => (
          <span className="tabular-nums text-text-secondary">{formatMillimes(it.unit_price)}</span>
        ),
      },
      {
        key: "total",
        header: "Total",
        width: pixel(150),
        align: "end",
        renderCell: (it) => (
          <span className="font-medium tabular-nums text-text-primary">
            {formatMillimes(it.quantity * it.unit_price)}
          </span>
        ),
      },
    ],
    [],
  );

  const paymentColumns = useMemo<TableColumn<PaymentRow>[]>(
    () => [
      {
        key: "created_at",
        header: "Date et heure",
        width: pixel(160),
        renderCell: (p) => (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {formatDateTime(p.created_at)}
          </Text>
        ),
      },
      {
        key: "kind",
        header: "Type",
        width: pixel(150),
        renderCell: (p) => (
          <Badge
            variant={p.kind === "refund" ? "error" : "success"}
            label={PAYMENT_KIND_LABELS[p.kind] || p.kind}
          />
        ),
      },
      {
        key: "recorded_by_label",
        header: "Enregistré par",
        width: proportional(1),
        renderCell: (p) => (
          <Text type="supporting" color="secondary">
            {p.recorded_by_label}
          </Text>
        ),
      },
      {
        key: "note",
        header: "Note",
        width: proportional(2),
        renderCell: (p) => (
          <Text type="supporting" color="secondary">
            {p.note || "—"}
          </Text>
        ),
      },
      {
        key: "amount",
        header: "Montant",
        width: pixel(150),
        align: "end",
        renderCell: (p) => (
          <span
            className={`font-semibold tabular-nums ${p.kind === "refund" ? "text-danger" : "text-success"}`}
          >
            {p.kind === "refund" ? "-" : "+"}
            {formatMillimes(p.amount)}
          </span>
        ),
      },
    ],
    [],
  );

  if (orderQ.isError && !order) {
    return (
      <DashboardShell title="Commande">
        <Card padding={0}>
          <ErrorState message={(orderQ.error as Error).message} onRetry={() => void orderQ.refetch()} />
        </Card>
      </DashboardShell>
    );
  }

  if (isLoading || !order) {
    return (
      <DashboardShell title="Chargement…">
        <PageLoader />
      </DashboardShell>
    );
  }

  const isClosed = order.status === "delivered" || order.status === "cancelled";
  const canDeliver = order.reste <= 0;
  const itemRows = order.items.map((it, i) => ({ ...it, index: i + 1 })) as ItemRow[];
  const paymentRows = order.payments as PaymentRow[];

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
      icon: lucide(Edit),
      onClick: () => navigate(`/commandes/${id}/edit`),
    });
    if (order.reste > 0 && !(order.status === "ready" && !canDeliver)) {
      moreItems.push({
        label: "Enregistrer un paiement",
        icon: lucide(CreditCard),
        onClick: () => setPaymentModalOpen(true),
      });
    }
  }
  if (order.status !== "delivered") {
    moreItems.push({
      label: "Imprimer le ticket",
      icon: lucide(Printer),
      disabled: order.status === "pending",
      hint: order.status === "pending" ? "Disponible après confirmation" : undefined,
      onClick: () => navigate(`/commandes/${id}/ticket`),
    });
  }
  if (order.status === "ready" && !canDeliver && isAdmin) {
    moreItems.push({
      label: "Forcer la livraison",
      icon: lucide(ShieldAlert),
      hint: "Admin — livrer malgré un reste à payer",
      danger: true,
      onClick: () => setForceDeliverOpen(true),
    });
  }
  if (!isClosed) {
    moreItems.push({
      label: "Annuler la commande",
      icon: lucide(XCircle),
      danger: true,
      onClick: () => setCancelModalOpen(true),
    });
  }

  // ONE main action for the next step, the rest in "Plus".
  const mainAction =
    order.status === "pending" ? (
      <Button
        icon={lucide(Check)}
        loading={confirmMutation.isPending}
        disabled={order.items.length === 0}
        onClick={() => confirmMutation.mutate()}
      >
        Confirmer la commande
      </Button>
    ) : order.status === "confirmed" ? (
      <Button icon={lucide(Play)} loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
        Démarrer le travail
      </Button>
    ) : order.status === "in_progress" ? (
      <Button icon={lucide(CheckCircle2)} loading={readyMutation.isPending} onClick={() => readyMutation.mutate()}>
        Marquer prête
      </Button>
    ) : order.status === "ready" ? (
      canDeliver ? (
        <Button
          icon={lucide(Truck)}
          loading={deliverMutation.isPending}
          onClick={() => deliverMutation.mutate({ force: false })}
        >
          Livrer la commande
        </Button>
      ) : (
        <Button icon={lucide(CreditCard)} onClick={() => setPaymentModalOpen(true)}>
          {`Encaisser le solde (${formatMillimes(order.reste)})`}
        </Button>
      )
    ) : order.status === "delivered" ? (
      <Button icon={lucide(Printer)} onClick={() => navigate(`/commandes/${id}/ticket`)}>
        Imprimer le ticket
      </Button>
    ) : null;

  const resteTone =
    order.reste > 0 ? "warning" : order.reste < 0 ? "info" : "success";
  const resteBox = {
    warning: "border-warning/30 bg-warning/10",
    info: "border-info/30 bg-info/10",
    success: "border-success/30 bg-success/10",
  }[resteTone];
  const resteText = { warning: "text-warning", info: "text-info", success: "text-success" }[resteTone];

  return (
    <DashboardShell
      title={`Commande ${order.ticket_no}`}
      subtitle={`Créée le ${formatDateTime(order.created_at)}`}
      actions={
        <>
          {nextStepHint && (
            <Text type="supporting" color="secondary">
              {nextStepHint}
            </Text>
          )}
          {mainAction}
          <MoreMenu items={moreItems} />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <Button variant="ghost" size="sm" icon={lucide(ArrowLeft)} onClick={() => navigate("/commandes")}>
            Toutes les commandes
          </Button>
        </div>

        <StatusSteps status={order.status} />

        {error && <Banner status="error" title={error} />}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Customer & order details */}
          <Card padding={5}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Heading level={3}>Client</Heading>
              <div className="flex items-center gap-1.5">
                <TypeBadge orderType={order.order_type} />
                <StatusBadge status={order.status} />
              </div>
            </div>
            <MetadataList label={{ position: "top" }}>
              <MetadataListItem label="Nom">
                <span className="font-semibold">{order.customer_name || "Sans nom (Brouillon)"}</span>
              </MetadataListItem>
              {order.customer_phone ? (
                <MetadataListItem label="Téléphone">{formatPhone(order.customer_phone)}</MetadataListItem>
              ) : null}
              {order.order_type === "online" ? (
                <MetadataListItem label="Adresse de livraison">
                  {order.delivery_address || "Adresse non renseignée"}
                </MetadataListItem>
              ) : null}
              {order.due_date ? (
                <MetadataListItem label="Prévu pour le">{formatDate(order.due_date)}</MetadataListItem>
              ) : null}
              {order.description ? (
                <MetadataListItem label="Description">
                  <span className="whitespace-pre-line">{order.description}</span>
                </MetadataListItem>
              ) : null}
            </MetadataList>
          </Card>

          {/* Money overview */}
          <div className="md:col-span-2">
            <Card padding={5}>
              <SectionHeader
                title="Synthèse financière"
                action={
                  <Button variant="secondary" size="sm" icon={lucide(Plus)} onClick={() => setPaymentModalOpen(true)}>
                    {isClosed ? "Enregistrer un remboursement" : "Enregistrer un paiement"}
                  </Button>
                }
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MoneyTile
                  label="Articles"
                  value={formatMillimes(order.total_amount)}
                  hint={`${order.items.length} article(s)`}
                />
                <MoneyTile
                  label="Livraison"
                  value={formatMillimes(order.delivery_fee)}
                  hint={order.order_type === "online" ? "En ligne" : "Gratuit (Local)"}
                />
                <MoneyTile
                  label="Payé à ce jour"
                  value={formatMillimes(order.paid)}
                  valueClass="text-success"
                  hint={`${order.payments.length} versement(s)`}
                />
                <MoneyTile
                  label={order.reste < 0 ? "Trop-perçu" : "Reste à payer"}
                  value={formatMillimes(Math.abs(order.reste))}
                  valueClass={resteText}
                  boxClass={`border ${resteBox}`}
                  hint={order.reste <= 0 ? "Soldé" : "En attente de règlement"}
                />
              </div>
            </Card>
          </div>
        </div>

        {/* Articles */}
        <Card padding={5}>
          <SectionHeader
            title={`Articles commandés (${order.items.length})`}
            action={
              !isClosed ? (
                <Button variant="ghost" size="sm" icon={lucide(Edit)} onClick={() => navigate(`/commandes/${id}/edit`)}>
                  Modifier les articles
                </Button>
              ) : undefined
            }
          />
          {itemRows.length === 0 ? (
            <Text color="secondary" display="block">
              Aucun article dans cette commande.
            </Text>
          ) : (
            <>
              <div className="hidden md:block">
                <Table<ItemRow> data={itemRows} columns={itemColumns} idKey="id" verticalAlign="middle" />
              </div>
              <ul className="divide-y divide-border md:hidden">
                {itemRows.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block font-medium">{it.label}</span>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {it.quantity} × {formatMillimes(it.unit_price)}
                      </Text>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatMillimes(it.quantity * it.unit_price)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Payments ledger */}
        <Card padding={5}>
          <SectionHeader title="Paiements et acomptes" />
          {paymentRows.length === 0 ? (
            <Text color="secondary" display="block">
              Aucun paiement enregistré pour le moment.
            </Text>
          ) : (
            <>
              <div className="hidden md:block">
                <Table<PaymentRow> data={paymentRows} columns={paymentColumns} idKey="id" verticalAlign="middle" />
              </div>
              <ul className="divide-y divide-border md:hidden">
                {paymentRows.map((p) => {
                  const isRefund = p.kind === "refund";
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                      <span className="flex min-w-0 flex-col items-start gap-1">
                        <Badge
                          variant={isRefund ? "error" : "success"}
                          label={PAYMENT_KIND_LABELS[p.kind] || p.kind}
                        />
                        <Text type="supporting" color="secondary">
                          {formatDateTime(p.created_at)} · {p.recorded_by_label}
                          {p.note ? ` · ${p.note}` : ""}
                        </Text>
                      </span>
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${isRefund ? "text-danger" : "text-success"}`}
                      >
                        {isRefund ? "-" : "+"}
                        {formatMillimes(p.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

        {/* Timeline & notes */}
        <Card padding={5}>
          <SectionHeader title="Historique et notes" />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newNote.trim()) noteMutation.mutate();
            }}
            className="flex items-start gap-2"
          >
            <div className="min-w-0 flex-1">
              <TextInput
                label="Nouvelle note"
                isLabelHidden
                placeholder="Ajouter une note ou instruction interne…"
                value={newNote}
                onChange={setNewNote}
                width="100%"
              />
            </div>
            <Button
              variant="secondary"
              type="submit"
              icon={lucide(MessageSquare)}
              disabled={!newNote.trim() || noteMutation.isPending}
              loading={noteMutation.isPending}
            >
              Ajouter
            </Button>
          </form>

          <ol className="mt-4 flex flex-col gap-2.5">
            {order.events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-start gap-3 rounded-card border border-border bg-surface-2/30 p-3"
              >
                <span className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
                  <Icon icon={Clock} size="sm" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <Text weight="semibold">{ORDER_EVENT_LABELS[ev.type] || ev.type}</Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDateTime(ev.created_at)}
                    </Text>
                  </div>
                  <Text type="supporting" color="secondary" display="block">
                    Par <span className="font-medium text-text-primary">{ev.actor_label}</span>
                  </Text>
                  {ev.payload && (
                    <p className="mt-1.5 break-words rounded bg-surface p-2 font-mono text-[11px] text-text-secondary">
                      {ev.payload}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
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
        loading={cancelMutation.isPending}
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

function MoneyTile({
  label,
  value,
  hint,
  valueClass = "text-text-primary",
  boxClass = "",
}: {
  label: string;
  value: string;
  hint: string;
  valueClass?: string;
  boxClass?: string;
}) {
  return (
    <div className={`rounded-card bg-surface-2 p-3 ${boxClass}`}>
      <Text type="supporting" color="secondary" display="block">
        {label}
      </Text>
      <span className={`mt-1 block text-base font-bold tabular-nums ${valueClass}`}>{value}</span>
      <Text type="supporting" color="secondary" display="block">
        {hint}
      </Text>
    </div>
  );
}
