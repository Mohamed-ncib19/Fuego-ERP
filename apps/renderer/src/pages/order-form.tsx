import { DateInput } from "@astryxdesign/core/DateInput";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  Truck,
  MapPin,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Button,
  Input,
  Select,
  Card,
  Label,
  FieldError,
  PhoneInput,
  PageLoader,
} from "@/components/ui";
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

  return (
    <DashboardShell
      title={isEdit ? `Modifier Commande ${existingOrder?.ticket_no || ""}` : "Nouvelle Commande"}
      subtitle="Saisie des articles, type de livraison et acompte"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(isEdit ? `/commandes/${id}` : "/commandes")}
            className="gap-2 text-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Retour</span>
          </Button>

          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {error && <FieldError message={error} />}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Main Info */}
          <Card className="p-5 md:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              1. Informations Client
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Nom du client</Label>
                <Input
                  placeholder="Ex: Foulen Ben Foulen"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <Label>Téléphone</Label>
                <PhoneInput
                  value={customerPhone}
                  onChange={setCustomerPhone}
                  invalid={phoneIncomplete}
                />
                {phoneIncomplete && <FieldError message="8 chiffres attendus : xx xxx xxx" />}
              </div>
            </div>

            <div>
              <Label>Description / Détails de la demande</Label>
              <Input
                placeholder="Ex: Tirage de plans, reliure spirale, badge PVC..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </Card>

          {/* Delivery & Due Date */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              2. Modalités
            </h2>

            <div>
              <Label>Type de commande</Label>
              <Select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as OrderType)}
                disabled={isEdit && existingOrder?.status !== "pending"}
              >
                <option value="local">Retrait au comptoir (Local)</option>
                <option value="online">À livrer (En ligne)</option>
              </Select>
            </div>

            {orderType === "online" && (
              <>
                <div>
                  <Label>Adresse de livraison *</Label>
                  <Input
                    placeholder="Rue, Ville, Code postal..."
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Frais de livraison (DT)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="Ex: 7.000"
                    value={deliveryFeeDt}
                    onChange={(e) => setDeliveryFeeDt(e.target.value)}
                  />
                </div>
              </>
            )}

            <DateInput
              label="Date promise (Livraison prévue)"
              value={(dueDate || undefined) as IsoDate | undefined}
              onChange={(v) => setDueDate((v ?? ""))}
              format="date"
              hasClear
              width="100%"
            />
          </Card>
        </div>

        {/* Articles Editor */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              3. Articles & Tarifs
            </h2>
            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={addItem}>
              <Plus className="h-3.5 w-3.5" />
              <span>Ajouter un article</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-text-secondary">
                <tr>
                  <th className="py-2 font-semibold">Libellé de l'article</th>
                  <th className="w-24 py-2 font-semibold">Quantité</th>
                  <th className="w-32 py-2 font-semibold">Prix unit. (DT)</th>
                  <th className="w-32 py-2 text-right font-semibold">Total ligne</th>
                  <th className="w-10 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {items.map((item, index) => {
                  const unitPrice = parseFloat(item.unit_price_dt.replace(",", ".") || "0");
                  const lineTotal = item.quantity * Math.max(0, unitPrice);
                  return (
                    <tr key={item.id}>
                      <td className="py-2.5 pr-3">
                        <Input
                          placeholder="Ex: Affiche A3, Impression quadri..."
                          value={item.label}
                          onChange={(e) => updateItem(index, { label: e.target.value })}
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(index, { quantity: parseInt(e.target.value) || 1 })
                          }
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={item.unit_price_dt}
                          onChange={(e) => updateItem(index, { unit_price_dt: e.target.value })}
                        />
                      </td>
                      <td className="py-2.5 text-right font-medium text-text-primary">
                        {new Intl.NumberFormat("fr-FR", {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 3,
                        }).format(lineTotal)}{" "}
                        DT
                      </td>
                      <td className="py-2.5 text-right">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="rounded p-1 text-text-secondary hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals Summary Footer */}
          <div className="flex flex-col items-end gap-1.5 border-t border-border pt-4 text-sm">
            <div className="flex w-64 justify-between text-text-secondary">
              <span>Total Articles:</span>
              <span className="font-medium text-text-primary">
                {formatMillimes(totalArticlesMillimes)}
              </span>
            </div>
            {orderType === "online" && (
              <div className="flex w-64 justify-between text-text-secondary">
                <span>Frais de livraison:</span>
                <span className="font-medium text-text-primary">
                  {formatMillimes(deliveryFeeMillimes)}
                </span>
              </div>
            )}
            <div className="flex w-64 justify-between border-t border-border/60 pt-2 text-base font-bold text-text-primary">
              <span>Grand Total:</span>
              <span className="text-primary">{formatMillimes(grandTotalMillimes)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Confirmation & Advance Dialog */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowConfirmModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-modal border border-border bg-surface p-6 shadow-hover">
            <h2 className="text-h3 font-semibold text-text-primary">
              Confirmer la commande
            </h2>
            <p className="mt-2 text-xs text-text-secondary">
              La commande passera en statut <strong>Confirmée</strong>. Vous pouvez enregistrer
              une avance maintenant (optionnel).
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <Label>Montant de l'avance (Acompte en DT)</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={confirmAdvanceDt}
                  onChange={(e) => setConfirmAdvanceDt(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="rounded-card bg-surface-2 p-3 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span>Montant total:</span>
                  <span className="font-bold text-text-primary">{formatMillimes(grandTotalMillimes)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
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
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
