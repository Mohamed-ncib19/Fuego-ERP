import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, Ticket, Database, Download, Upload, ShieldCheck, ArrowRight } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { settingsApi } from "@/lib/api/settings.api";
import { useSettings } from "@/hooks/use-queries";
import { useToast } from "@/hooks/use-toast";
import { Button, Card, Input, Label, ConfirmDialog } from "@/components/ui";

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState("");
  const [ticketFooter, setTicketFooter] = useState("");

  // Restore state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestoreBase64, setPendingRestoreBase64] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>("");
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.business_name ?? "");
      setTicketFooter(settings.ticket_footer ?? "");
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      settingsApi.update({
        business_name: businessName,
        ticket_footer: ticketFooter || null,
      }),
    onSuccess: () => {
      toast.success("Paramètres enregistrés");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const handleDownloadBackup = async () => {
    try {
      setIsDownloadingBackup(true);
      await settingsApi.downloadBackup();
      toast.success("Copie de sauvegarde téléchargée");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du téléchargement de la sauvegarde");
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".db") && !file.name.endsWith(".sqlite")) {
      toast.error("Veuillez sélectionner un fichier de base de données valide (.db)");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setPendingRestoreBase64(base64);
      setPendingFileName(file.name);
      e.target.value = "";
    };
    reader.onerror = () => {
      toast.error("Erreur de lecture du fichier");
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const restoreMutation = useMutation({
    mutationFn: (base64: string) => settingsApi.restore(base64),
    onSuccess: (res) => {
      toast.success(res.message || "Base de données restaurée avec succès");
      setPendingRestoreBase64(null);
      // Invalidate all caches so everything refreshes with the restored DB
      queryClient.invalidateQueries();
      // Reload page to re-initialize stores
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: (err: any) => {
      toast.error(err.message || "Échec de la restauration de la base");
    },
  });

  return (
    <DashboardShell title="Paramètres" subtitle="Identité du commerce, tickets et maintenance">
      <div className="max-w-xl space-y-6">
        {/* Business Settings */}
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

        {/* Tickets Settings */}
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
            Imprimé en bas de chaque ticket de commande imprimable.
          </p>
        </Card>

        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Enregistrer les modifications
        </Button>

        {/* Database Backup & Restore */}
        <Card className="p-5 border-primary/20">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-h3 font-semibold text-text-primary">
              Base de données & Sauvegardes
            </h2>
          </div>
          <p className="mb-4 text-xs text-text-secondary">
            Effectuez des copies de sécurité régulières pour protéger vos commandes, clients et
            données comptables.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              loading={isDownloadingBackup}
              onClick={handleDownloadBackup}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Télécharger une sauvegarde (.db)
            </Button>

            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Restaurer une sauvegarde
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".db,.sqlite"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>
        </Card>

        {/* Audit Trail Link */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-surface-2 p-2 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Journal d'audit</h3>
                <p className="text-xs text-text-secondary">
                  Consulter la traçabilité des opérations, modifications et suppressions.
                </p>
              </div>
            </div>
            <Link to="/audit">
              <Button variant="secondary" className="gap-1.5 text-xs">
                <span>Ouvrir</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(pendingRestoreBase64)}
        onClose={() => setPendingRestoreBase64(null)}
        onConfirm={() => {
          if (pendingRestoreBase64) restoreMutation.mutate(pendingRestoreBase64);
        }}
        title="Restaurer la base de données"
        message={`Attention : Vous êtes sur le point de remplacer TOUTES les données actuelles par le fichier "${pendingFileName}". Cette action est irréversible. Voulez-vous continuer ?`}
        confirmLabel="Remplacer et restaurer"
        danger
        loading={restoreMutation.isPending}
      />
    </DashboardShell>
  );
}
