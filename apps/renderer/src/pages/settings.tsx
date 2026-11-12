import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, Ticket } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { apiPatch } from "@/lib/api/client";
import { useSettings } from "@/hooks/use-queries";
import { useToast } from "@/hooks/use-toast";
import { Button, Card, Input, Label } from "@/components/ui";

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState("");
  const [ticketFooter, setTicketFooter] = useState("");

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.business_name ?? "");
      setTicketFooter(settings.ticket_footer ?? "");
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      apiPatch("/settings", {
        business_name: businessName,
        ticket_footer: ticketFooter || null,
      }),
    onSuccess: () => {
      toast.success("Paramètres enregistrés");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <DashboardShell title="Paramètres" subtitle="Identité du commerce et tickets">
      <div className="max-w-xl space-y-4">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <h2 className="text-h3 font-semibold text-text-primary">Commerce</h2>
          </div>
          {isLoading ? null : (
            <div className="space-y-4">
              <div>
                <Label>Nom du commerce</Label>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                <p className="mt-1 text-xs text-text-secondary">
                  Affiché sur l'écran de connexion et sur les tickets.
                </p>
              </div>
              <div>
                <Label>Devise</Label>
                <Input value={settings?.currency ?? "TND"} disabled />
                <p className="mt-1 text-xs text-text-secondary">Fixée au dinar tunisien (DT).</p>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            <h2 className="text-h3 font-semibold text-text-primary">Tickets</h2>
          </div>
          <Label>Pied de ticket (optionnel)</Label>
          <Input
            value={ticketFooter}
            onChange={(e) => setTicketFooter(e.target.value)}
            placeholder="Ex : Merci de votre confiance — 12 rue de la République, Tunis"
          />
          <p className="mt-1 text-xs text-text-secondary">
            Imprimé en bas de chaque ticket de commande (Phase 1).
          </p>
        </Card>

        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Enregistrer
        </Button>
      </div>
    </DashboardShell>
  );
}
