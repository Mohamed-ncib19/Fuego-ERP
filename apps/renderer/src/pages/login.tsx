import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Flame } from "lucide-react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { InputGroup } from "@astryxdesign/core/InputGroup";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Banner } from "@astryxdesign/core/Banner";
import { authApi, settingsApi, setupApi } from "@/lib/api/auth.api";
import { useAuthStore } from "@/hooks/use-auth-store";

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

  const { control, handleSubmit, formState } = useForm<{
    email: string;
    password: string;
  }>({ defaultValues: { email: "", password: "" } });
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
    <div className="flex min-h-screen items-center justify-center bg-surface-2 bg-[radial-gradient(ellipse_at_top,rgb(var(--color-primary-500)/0.14),transparent_60%)] p-4">
      <div className="w-full max-w-sm">
        <Card padding={8} elevation="high" width="100%">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-primary shadow-md">
              <Flame className="h-7 w-7 text-neutral-950" />
            </div>
            <h1 className="text-h2 font-bold text-text-primary">{businessName}</h1>
            <p className="text-sm text-text-secondary">Gestion des commandes & finances</p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && <Banner status="error" title={error} />}

            <Controller
              name="email"
              control={control}
              rules={{ validate: loginSchema.email }}
              render={({ field }) => (
                <TextInput
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="vous@commerce.tn"
                  value={field.value}
                  onChange={field.onChange}
                  htmlName={field.name}
                  hasAutoFocus
                  width="100%"
                  status={
                    errors.email?.message
                      ? { type: "error", message: errors.email.message }
                      : undefined
                  }
                />
              )}
            />

            <Controller
              name="password"
              control={control}
              rules={{ validate: loginSchema.password }}
              render={({ field }) => (
                <InputGroup
                  label="Mot de passe"
                  status={
                    errors.password?.message
                      ? { type: "error", message: errors.password.message }
                      : undefined
                  }
                >
                  <TextInput
                    label="Mot de passe"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={field.value}
                    onChange={field.onChange}
                    htmlName={field.name}
                    status={errors.password ? { type: "error" } : undefined}
                  />
                  <Button
                    label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    isIconOnly
                    variant="secondary"
                    icon={showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    onClick={() => setShowPassword((v) => !v)}
                  />
                </InputGroup>
              )}
            />

            <Button
              label="Se connecter"
              type="submit"
              variant="primary"
              width="100%"
              isLoading={isSubmitting || mutation.isPending}
            >
              Se connecter
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-text-secondary">
          Fuego — gestion de commerce · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
