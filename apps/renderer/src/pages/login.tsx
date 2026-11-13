import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Flame } from "lucide-react";
import { authApi, settingsApi, setupApi } from "@/lib/api/auth.api";
import { useAuthStore } from "@/hooks/use-auth-store";
import { Button, Input, Label, FieldError } from "@/components/ui";

const loginSchema = {
  email: (v: string) => /\S+@\S+\.\S+/.test(v) || "Adresse e-mail invalide",
  password: (v: string) => v.length >= 1 || "Mot de passe requis",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { setSession, status, hydrate } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A visitor with a live session cookie (Back button, stale tab) must never
  // land on the form: restore the identity and send them straight back.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => {
    if (status === "authenticated") navigate("/dashboard", { replace: true });
  }, [status, navigate]);

  // Settings are public — the card shows the business name. Fails soft.
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.get(),
    retry: false,
  });
  const businessName = settings?.business_name?.trim() || "Fuego";

  // No user exists yet → the login form can never succeed; send the visitor
  // to the first-run wizard instead (fresh-install bug fix).
  const { data: setupStatus } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => setupApi.status(),
    retry: false,
  });
  useEffect(() => {
    if (setupStatus?.needs_setup) navigate("/setup", { replace: true });
  }, [setupStatus, navigate]);

  const { register, handleSubmit, formState } = useForm<{
    email: string;
    password: string;
  }>();
  const { errors, isSubmitting } = formState;

  const mutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      setSession(data.user);
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => setError((err as Error).message),
  });

  const onSubmit = handleSubmit(({ email, password }) => {
    setError(null);
    mutation.mutate({ email, password });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-500 via-primary-700 to-primary-950 p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-modal border border-border bg-surface p-8 shadow-hover">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-primary shadow-md">
              <Flame className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-h2 font-bold text-text-primary">{businessName}</h1>
            <p className="text-sm text-text-secondary">Gestion des commandes & finances</p>
          </div>

          {error && (
            <div className="mb-4 rounded-btn border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                autoComplete="email"
                placeholder="vous@commerce.tn"
                {...register("email", { validate: loginSchema.email })}
              />
              <FieldError message={errors.email?.message as string | undefined} />
            </div>
            <div>
              <Label>Mot de passe</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-10"
                  {...register("password", { validate: loginSchema.password })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary hover:text-text-primary"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <FieldError message={errors.password?.message as string | undefined} />
            </div>
            <Button type="submit" className="w-full" loading={isSubmitting || mutation.isPending}>
              Se connecter
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-white/70">
          Fuego — gestion de commerce · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
