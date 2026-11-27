import { DateInput } from "@astryxdesign/core/DateInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Field } from "@astryxdesign/core/Field";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Save, CheckCircle } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button, Card, Modal, PhoneInput, PageLoader } from "@/components/ui";
import { ordersApi, type CreateOrderItemInput } from "@/lib/api/orders.api";
import { formatMillimes, type IsoDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { isValidPhone, normalizePhone, type OrderType } from "@fuego/shared";

interface FormItem {
  id: string;
  label: string;
  quantity: number;
  unit_price_dt: string; // Dinars string with decimals
}

const ORDER_TYPE_OPTIONS = [
  { value: "local", label: "Retrait au comptoir (Local)" },
  { value: "online", label: "À livrer (En ligne)" },
];

/** Dinars text ("7,5" / "7.500") → number, the way the form has always read it. */
const dinars = (s: string) => parseFloat(s.replace(",", ".") || "0");

/** NumberInput at rest shows amounts like the rest of the app: "7,500". */
const DT_FORMAT = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const formatDt = (v: number) => DT_FORMAT.format(v);

/** Grid shared by the article header row and each line (sm and up). */
const LINE_GRID =
  "grid-cols-2 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_96px_150px_120px_36px] sm:items-center sm:gap-3";

export default function OrderFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("local");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryFeeDt, setDeliveryFeeDt] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<FormItem[]>([
    { id: "1", label: "", quantity: 1, unit_price_dt: "0" },
  ]);

  const [confirmAdvanceDt, setConfirmAdvanceDt] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optional field — but once started it must be a complete 8-digit number.
  const phoneIncomplete = customerPhone.length > 0 && !isValidPhone(customerPhone);

  // Load existing order for edit
  const { data: existingOrder, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.get(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingOrder) {
      setCustomerName(existingOrder.customer_name || "");
      setCustomerPhone(normalizePhone(existingOrder.customer_phone));
      setDescription(existingOrder.description || "");
      setOrderType(existingOrder.order_type);
      setDeliveryAddress(existingOrder.delivery_address || "");
      setDeliveryFeeDt((existingOrder.delivery_fee / 1000).toFixed(3));
      setDueDate(existingOrder.due_date || "");

      if (existingOrder.items && existingOrder.items.length > 0) {
        setItems(
          existingOrder.items.map((it, idx) => ({
            id: String(idx + 1),
            label: it.label,
            quantity: it.quantity,
            unit_price_dt: (it.unit_price / 1000).toFixed(3),
          })),
        );
      }
    }
  }, [existingOrder]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: String(Date.now()), label: "", quantity: 1, unit_price_dt: "0" },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, patch: Partial<FormItem>) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  };

  // Calculations
  const validItems = useMemo<CreateOrderItemInput[]>(() => {
    return items
      .filter((it) => it.label.trim())
      .map((it) => {
        const price = Math.round(parseFloat(it.unit_price_dt.replace(",", ".") || "0") * 1000);
        return {
          label: it.label.trim(),
          quantity: Math.max(1, it.quantity || 1),
          unit_price: Math.max(0, price),
        };
      });
  }, [items]);

  const totalArticlesMillimes = useMemo(() => {
    return validItems.reduce((acc, it) => acc + it.quantity * it.unit_price, 0);
  }, [validItems]);

  const deliveryFeeMillimes = useMemo(() => {
    if (orderType === "local") return 0;
    const fee = parseFloat(deliveryFeeDt.replace(",", ".") || "0");
    return Math.max(0, Math.round(fee * 1000));
  }, [orderType, deliveryFeeDt]);

  const grandTotalMillimes = totalArticlesMillimes + deliveryFeeMillimes;

  const saveMutation = useMutation({
    mutationFn: async ({ andConfirm = false }: { andConfirm?: boolean }) => {
      setError(null);
      const hasClient = Boolean(customerName.trim() || description.trim());
      const hasArticles = validItems.length > 0;
      if (!hasClient && !hasArticles) {
        throw new Error("Renseignez au moins un client, une description ou un article");
      }

      if (phoneIncomplete) {
        throw new Error("Le téléphone doit contenir 8 chiffres (+216 xx xxx xxx)");
      }

      if (orderType === "online" && !deliveryAddress.trim()) {
        throw new Error("L'adresse de livraison est obligatoire pour une commande en ligne");
      }

      const payload = {
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone || undefined,
        description: description.trim() || undefined,
        order_type: orderType,
        delivery_address: orderType === "online" ? deliveryAddress.trim() || undefined : undefined,
        delivery_fee: deliveryFeeMillimes,
        due_date: dueDate || undefined,
        items: validItems,
      };

      let order;
      if (isEdit) {
        order = await ordersApi.update(id!, payload);
      } else {
        order = await ordersApi.create(payload);
      }

      if (andConfirm) {
        if (order.items.length === 0) {
          throw new Error("Ajoutez au moins un article avant de confirmer");
        }
        const advanceMillimes = confirmAdvanceDt
          ? Math.round(parseFloat(confirmAdvanceDt.replace(",", ".")) * 1000)
          : 0;
        order = await ordersApi.confirm(order.id, {
          advance_amount: advanceMillimes > 0 ? advanceMillimes : undefined,
        });
      }

      return order;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", order.id] });
      toast.success(isEdit ? "Commande mise à jour" : "Commande créée avec succès");
      navigate(`/commandes/${order.id}`);
    },
    onError: (err: any) => {
      setError(err?.message || "Erreur lors de l'enregistrement");
    },
  });

  if (isEdit && isLoading) {
    return (
      <DashboardShell title="Chargement...">
        <PageLoader />
      </DashboardShell>
    );
  }

  const typeLocked = isEdit && existingOrder?.status !== "pending";

  return (
    <DashboardShell
      title={isEdit ? `Modifier Commande ${existingOrder?.ticket_no || ""}` : "Nouvelle Commande"}
      subtitle="Saisie des articles, type de livraison et acompte"
      actions={
        <>
          <Button
            variant="secondary"
            loading={saveMutation.isPending && !showConfirmModal}
            onClick={() => saveMutation.mutate({ andConfirm: false })}
          >
            <Save className="h-4 w-4" />
            <span>Enregistrer (Brouillon)</span>
          </Button>
          <Button
            variant="primary"
            disabled={validItems.length === 0}
            title={validItems.length === 0 ? "Ajoutez au moins un article pour confirmer" : ""}
            onClick={() => {
              setShowConfirmModal(true);
            }}
          >
            <CheckCircle className="h-4 w-4" />
            <span>Confirmer la commande</span>
          </Button>
        </>
      }
    >
      <div className="max-w-5xl space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(isEdit ? `/commandes/${id}` : "/commandes")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Retour</span>
          </Button>
        </div>

        {error && <Banner status="error" title={error} />}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Main Info */}
          <Card className="space-y-4 p-5 md:col-span-2">
            <Heading level={3} accessibilityLevel={2}>1. Informations client</Heading>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput
                label="Nom du client"
                placeholder="Ex: Foulen Ben Foulen"
                value={customerName}
                onChange={setCustomerName}
                autoComplete="off"
                hasAutoFocus={!isEdit}
                width="100%"
              />
              <Field
                label="Téléphone"
                inputID="order-customer-phone"
                isGroupLabel
                isOptional
                width="100%"
                status={
                  phoneIncomplete
                    ? { type: "error", message: "8 chiffres attendus : xx xxx xxx" }
                    : undefined
                }
              >
                <PhoneInput
                  value={customerPhone}
                  onChange={setCustomerPhone}
                  invalid={phoneIncomplete}
                />
              </Field>
            </div>

            <TextInput
              label="Description / Détails de la demande"
              placeholder="Ex: Tirage de plans, reliure spirale, badge PVC..."
              value={description}
              onChange={setDescription}
              width="100%"
            />
          </Card>

          {/* Delivery & Due Date */}
          <Card className="space-y-4 p-5">
            <Heading level={3} accessibilityLevel={2}>2. Modalités</Heading>

            <Selector
              label="Type de commande"
              options={ORDER_TYPE_OPTIONS}
              value={orderType}
              onChange={(v) => v && setOrderType(v as OrderType)}
              isDisabled={typeLocked}
              disabledMessage="Le type ne peut être changé que pour une commande en attente"
              width="100%"
            />

            {orderType === "online" && (
              <>
                <TextInput
                  label="Adresse de livraison"
                  placeholder="Rue, Ville, Code postal..."
                  value={deliveryAddress}
                  onChange={setDeliveryAddress}
                  isRequired
                  width="100%"
                />
                <NumberInput
                  label="Frais de livraison"
                  placeholder="Ex: 7,000"
                  value={dinars(deliveryFeeDt)}
                  onChange={(v) => setDeliveryFeeDt(String(v))}
                  min={0}
                  isWheelEnabled={false}
                  units="DT"
                  formatValue={formatDt}
                  width="100%"
                />
              </>
            )}

            <DateInput
              label="Date promise (Livraison prévue)"
              value={(dueDate || undefined) as IsoDate | undefined}
              onChange={(v) => setDueDate(v ?? "")}
              format="date"
              hasClear
              width="100%"
            />
          </Card>
        </div>

        {/* Articles Editor */}
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <Heading level={3} accessibilityLevel={2}>3. Articles & tarifs</Heading>
            <Button variant="secondary" size="sm" onClick={addItem}>
              <Plus className="h-3.5 w-3.5" />
              <span>Ajouter un article</span>
            </Button>
          </div>

          {/* Column names (the inputs carry hidden labels of their own). */}
          <div
            className={`${LINE_GRID} hidden border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary sm:grid`}
            aria-hidden
          >
            <span>Libellé de l'article</span>
            <span>Quantité</span>
            <span>Prix unit. (DT)</span>
            <span className="text-right">Total ligne</span>
            <span />
          </div>

          <ul className="divide-y divide-border">
            {items.map((item, index) => {
              const unitPrice = dinars(item.unit_price_dt);
              const lineTotal = item.quantity * Math.max(0, unitPrice);
              const n = index + 1;
              return (
                <li key={item.id} className={`grid ${LINE_GRID} py-3 first:pt-0 sm:py-2.5`}>
                  <div className="col-span-2 sm:col-span-1">
                    <TextInput
                      label={`Article ${n} : libellé`}
                      isLabelHidden
                      placeholder="Ex: Affiche A3, Impression quadri..."
                      value={item.label}
                      onChange={(v) => updateItem(index, { label: v })}
                      width="100%"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-text-secondary sm:hidden" aria-hidden>
                      Quantité
                    </span>
                    {/* TextInput, not NumberInput: totals must follow every keystroke. */}
                    <TextInput
                      label={`Article ${n} : quantité`}
                      isLabelHidden
                      inputMode="numeric"
                      placeholder="1"
                      value={item.quantity ? String(item.quantity) : ""}
                      onChange={(v) => updateItem(index, { quantity: parseInt(v.replace(/\D/g, ""), 10) || 0 })}
                      width="100%"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-text-secondary sm:hidden" aria-hidden>
                      Prix unitaire (DT)
                    </span>
                    <TextInput
                      label={`Article ${n} : prix unitaire`}
                      isLabelHidden
                      inputMode="decimal"
                      placeholder="0,000"
                      value={item.unit_price_dt === "0" ? "" : item.unit_price_dt}
                      onChange={(v) => updateItem(index, { unit_price_dt: v.replace(/[^\d.,]/g, "") || "0" })}
                      width="100%"
                    />
                  </div>
                  <div className="self-center text-sm font-medium tabular-nums text-text-primary sm:text-right">
                    <span className="text-text-secondary sm:hidden">Total : </span>
                    {formatDt(lineTotal)} DT
                  </div>
                  <div className="flex justify-end self-center">
                    {items.length > 1 && (
                      <IconButton
                        label={`Supprimer l'article ${n}`}
                        tooltip="Supprimer la ligne"
                        icon={<Trash2 className="h-4 w-4" />}
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Totals Summary Footer */}
          <div className="flex justify-end border-t border-border pt-4">
            <dl className="w-full space-y-1.5 text-sm sm:w-72">
              <div className="flex justify-between text-text-secondary">
                <dt>
                  Total articles
                  {validItems.length > 0 && ` (${validItems.length})`}
                </dt>
                <dd className="font-medium tabular-nums text-text-primary">
                  {formatMillimes(totalArticlesMillimes)}
                </dd>
              </div>
              {orderType === "online" && (
                <div className="flex justify-between text-text-secondary">
                  <dt>Frais de livraison</dt>
                  <dd className="font-medium tabular-nums text-text-primary">
                    {formatMillimes(deliveryFeeMillimes)}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-border pt-2 text-base font-bold text-text-primary">
                <dt>Total à payer</dt>
                <dd className="tabular-nums text-primary">{formatMillimes(grandTotalMillimes)}</dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>

      {/* Confirmation & Advance Dialog */}
      <Modal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirmer la commande"
        width="max-w-md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowConfirmModal(false)}
              disabled={saveMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              onClick={() => {
                setShowConfirmModal(false);
                saveMutation.mutate({ andConfirm: true });
              }}
            >
              Confirmer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Text type="supporting" color="secondary" display="block">
            La commande passera en statut <strong>Confirmée</strong>. Vous pouvez enregistrer une
            avance maintenant (optionnel).
          </Text>
          <NumberInput
            label="Montant de l'avance (acompte)"
            isOptional
            placeholder="0,000"
            value={confirmAdvanceDt ? dinars(confirmAdvanceDt) : null}
            onChange={(v) => setConfirmAdvanceDt(v == null ? "" : String(v))}
            hasClear
            min={0}
            isWheelEnabled={false}
            units="DT"
            formatValue={formatDt}
            hasAutoFocus
            width="100%"
          />
          <div className="flex justify-between rounded-card bg-surface-2 p-3 text-sm text-text-secondary">
            <span>Montant total</span>
            <span className="font-bold tabular-nums text-text-primary">
              {formatMillimes(grandTotalMillimes)}
            </span>
          </div>
        </div>
      </Modal>
    </DashboardShell>
  );
}
