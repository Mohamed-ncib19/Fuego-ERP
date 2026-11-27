import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, Database, Download, Upload, ShieldCheck, ArrowRight } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Divider } from "@astryxdesign/core/Divider";
import { TextInput } from "@astryxdesign/core/TextInput";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { settingsApi } from "@/lib/api/settings.api";
import { useSettings } from "@/hooks/use-queries";
import { useToast } from "@/hooks/use-toast";
import { Button, ConfirmDialog, Skeleton } from "@/components/ui";

/** Printed when the footer is left empty (see order-ticket.tsx). */
const DEFAULT_FOOTER =
  "Merci pour votre confiance ! Pour toute réclamation, veuillez présenter ce ticket.";

type Errors = Partial<Record<"businessName" | "ticketFooter", string>>;

function SectionTitle({ icon, children }: { icon: typeof Store; children: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">
        <Icon icon={icon} size="md" />
      </span>
      <Heading level={2}>{children}</Heading>
    </div>
  );
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [ticketFooter, setTicketFooter] = useState("");
  const [errors, setErrors] = useState<Errors>({});

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

  const dirty =
    !!settings &&
    (businessName !== (settings.business_name ?? "") ||
      ticketFooter !== (settings.ticket_footer ?? ""));

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

  // Same limits as the server (settings.dto.ts), shown on the field.
  const submit = () => {
    const e: Errors = {};
    if (businessName.trim().length < 2) e.businessName = "Nom de commerce requis (2 caractères minimum)";
    else if (businessName.length > 80) e.businessName = "80 caractères maximum";
    if (ticketFooter.length > 200) e.ticketFooter = "200 caractères maximum";
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate();
  };

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
      <div className="flex max-w-xl flex-col gap-6">
        {/* Business identity + ticket footer: one form, one save button. */}
        <Card>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <SectionTitle icon={Store}>Commerce et tickets</SectionTitle>
            {isLoading ? (
              <div className="flex flex-col gap-4" aria-busy="true">
                <Skeleton height={60} />
                <Skeleton height={60} />
                <Skeleton height={60} />
              </div>
            ) : (
              <>
                <TextInput
                  label="Nom du commerce"
                  description="Affiché sur l'écran de connexion et sur les tickets."
                  value={businessName}
                  onChange={(v) => {
                    setBusinessName(v);
                    setErrors((x) => ({ ...x, businessName: undefined }));
                  }}
                  isRequired
                  status={
                    errors.businessName ? { type: "error", message: errors.businessName } : undefined
                  }
                  width="100%"
                />
                <TextInput
                  label="Devise"
                  description="Fixée au dinar tunisien (DT)."
                  value={settings?.currency ?? "TND"}
                  isReadOnly
                  width="100%"
                />
                <TextInput
                  label="Pied de ticket"
                  isOptional
                  description={`Imprimé en bas de chaque ticket de commande. Laissé vide : « ${DEFAULT_FOOTER} »`}
                  value={ticketFooter}
                  onChange={(v) => {
                    setTicketFooter(v);
                    setErrors((x) => ({ ...x, ticketFooter: undefined }));
                  }}
                  placeholder="Ex : Merci de votre confiance — 12 rue de la République, Tunis"
                  hasClear
                  status={
                    errors.ticketFooter ? { type: "error", message: errors.ticketFooter } : undefined
                  }
                  width="100%"
                />
              </>
            )}
            <Divider />
            <div className="flex flex-wrap items-center justify-end gap-3">
              {dirty && (
                <Text type="supporting" color="secondary">
                  Modifications non enregistrées
                </Text>
              )}
              <Button type="submit" loading={save.isPending} disabled={!dirty}>
                Enregistrer les modifications
              </Button>
            </div>
          </form>
        </Card>

        {/* Database Backup & Restore */}
        <Card>
          <div className="flex flex-col gap-4">
            <SectionTitle icon={Database}>Base de données et sauvegardes</SectionTitle>
            <Text color="secondary" display="block">
              Effectuez des copies de sécurité régulières pour protéger vos commandes, clients et
              données comptables.
            </Text>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                loading={isDownloadingBackup}
                onClick={handleDownloadBackup}
                icon={<Download className="h-4 w-4" />}
              >
                Télécharger une sauvegarde (.db)
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                icon={<Upload className="h-4 w-4" />}
              >
                Restaurer une sauvegarde
              </Button>
              {/* Native picker, opened by the button above. */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".db,.sqlite"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>
          </div>
        </Card>

        {/* Audit Trail Link */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-surface-2 p-2 text-primary">
                <Icon icon={ShieldCheck} size="md" />
              </div>
              <div className="min-w-0">
                <Heading level={3}>Journal d'audit</Heading>
                <Text type="supporting" color="secondary" display="block">
                  Consulter la traçabilité des opérations, modifications et suppressions.
                </Text>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate("/audit")}>
              Ouvrir
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
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
