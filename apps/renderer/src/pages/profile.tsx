import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Banner } from "@astryxdesign/core/Banner";
import { Icon } from "@astryxdesign/core/Icon";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PasswordField } from "@/components/password-field";
import { authApi } from "@/lib/api/auth.api";
import { useAuthStore } from "@/hooks/use-auth-store";
import { useToast } from "@/hooks/use-toast";
import { Badge, Button } from "@/components/ui";
import { roleLabel } from "@/lib/format";

type Errors = Partial<Record<"current" | "next" | "confirm" | "form", string>>;

export default function ProfilePage() {
  const { user, clear } = useAuthStore();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!current) e.current = "Mot de passe actuel requis";
    if (!next) e.next = "Nouveau mot de passe requis";
    else if (next.length < 8) e.next = "8 caractères minimum";
    if (!confirm) e.confirm = "Confirmation requise";
    else if (next && confirm !== next) e.confirm = "Les mots de passe ne correspondent pas";
    return e;
  };

  const onSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const res = await authApi.changePassword(current, next);
      toast.success(res.message ?? "Mot de passe modifié");
      // Changing the password revokes every session, this one included.
      clear();
      queryClient.clear();
      navigate("/login", { replace: true });
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  /** Typing in a field clears its own error and the server error. */
  const edit =
    (set: (v: string) => void, key: keyof Errors) =>
    (v: string) => {
      set(v);
      setErrors((x) => ({ ...x, [key]: undefined, form: undefined }));
    };

  return (
    <DashboardShell title="Mon profil" subtitle="Votre compte et votre mot de passe">
      <div className="flex max-w-xl flex-col gap-4">
        <Card>
          <MetadataList columns="multi">
            <MetadataListItem label="Nom">{user?.full_name}</MetadataListItem>
            <MetadataListItem label="E-mail">{user?.email}</MetadataListItem>
            <MetadataListItem label="Rôle">
              {user && (
                <Badge tone={user.role === "super_admin" ? "primary" : "info"}>
                  {roleLabel[user.role]}
                </Badge>
              )}
            </MetadataListItem>
          </MetadataList>
        </Card>

        <Card>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-primary">
                <Icon icon={KeyRound} size="md" />
              </span>
              <Heading level={2}>Changer le mot de passe</Heading>
            </div>

            <Banner
              status="info"
              title="Vous devrez vous reconnecter"
              description="Après le changement, toutes les sessions (y compris celle-ci) sont révoquées : reconnectez-vous avec le nouveau mot de passe."
            />

            {errors.form && <Banner status="error" title={errors.form} />}

            <PasswordField
              label="Mot de passe actuel"
              autoComplete="current-password"
              value={current}
              onChange={edit(setCurrent, "current")}
              error={errors.current}
              isRequired
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PasswordField
                label="Nouveau mot de passe"
                autoComplete="new-password"
                placeholder="8 caractères min."
                value={next}
                onChange={edit(setNext, "next")}
                error={errors.next}
                isRequired
              />
              <PasswordField
                label="Confirmation"
                autoComplete="new-password"
                value={confirm}
                onChange={edit(setConfirm, "confirm")}
                error={errors.confirm}
                isRequired
              />
            </div>
            <div>
              <Button type="submit" loading={submitting}>
                Modifier le mot de passe
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </DashboardShell>
  );
}
