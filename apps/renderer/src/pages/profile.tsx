import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Info } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { authApi } from "@/lib/api/auth.api";
import { useAuthStore } from "@/hooks/use-auth-store";
import { useToast } from "@/hooks/use-toast";
import { Button, Card, Input, Label, FieldError, Badge } from "@/components/ui";
import { roleLabel } from "@/lib/format";

export default function ProfilePage() {
  const { user, clear } = useAuthStore();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<{
    current_password: string;
    new_password: string;
    confirm: string;
  }>();

  useEffect(() => {
    // Changing the password revokes every session — including this one — so
    // the user must log in again afterwards (explain it up front).
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    if (values.new_password !== values.confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (values.new_password.length < 8) {
      setError("8 caractères minimum");
      return;
    }
    try {
      const res = await authApi.changePassword(values.current_password, values.new_password);
      toast.success(res.message ?? "Mot de passe modifié");
      clear();
      queryClient.clear();
      navigate("/login", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <DashboardShell title="Mon profil" subtitle="Votre compte et votre mot de passe">
      <div className="max-w-xl space-y-4">
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-text-secondary">Nom</p>
              <p className="font-medium text-text-primary">{user?.full_name}</p>
            </div>
            <div>
              <p className="text-text-secondary">E-mail</p>
              <p className="font-medium text-text-primary">{user?.email}</p>
            </div>
            <div>
              <p className="text-text-secondary">Rôle</p>
              <p className="mt-1">
                <Badge tone={user?.role === "super_admin" ? "primary" : "info"}>
                  {user && roleLabel[user.role]}
                </Badge>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-h3 font-semibold text-text-primary">Changer le mot de passe</h2>
          </div>
          <div className="mb-4 flex items-start gap-2 rounded-btn border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Après le changement, toutes les sessions (y compris celle-ci) seront
              révoquées — vous devrez vous reconnecter avec le nouveau mot de passe.
            </p>
          </div>
          {error && (
            <div className="mb-4 rounded-btn border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <Label>Mot de passe actuel</Label>
              <Input
                type="password"
                autoComplete="current-password"
                {...register("current_password", { required: "Mot de passe actuel requis" })}
              />
              <FieldError message={formState.errors.current_password?.message as string | undefined} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nouveau mot de passe</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="8 caractères min."
                  {...register("new_password", {
                    required: "Nouveau mot de passe requis",
                    minLength: { value: 8, message: "8 caractères minimum" },
                  })}
                />
                <FieldError message={formState.errors.new_password?.message as string | undefined} />
              </div>
              <div>
                <Label>Confirmation</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...register("confirm", { required: "Confirmation requise" })}
                />
                <FieldError message={formState.errors.confirm?.message as string | undefined} />
              </div>
            </div>
            <Button type="submit" loading={formState.isSubmitting}>
              Modifier le mot de passe
            </Button>
          </form>
        </Card>
      </div>
    </DashboardShell>
  );
}
