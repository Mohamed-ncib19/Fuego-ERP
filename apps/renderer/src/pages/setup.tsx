import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm, type FieldError as RhfFieldError } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Banner } from "@astryxdesign/core/Banner";
import { authApi, setupApi } from "@/lib/api/auth.api";
import { useAuthStore } from "@/hooks/use-auth-store";

interface SetupForm {
  business_name: string;
  full_name: string;
  email: string;
  password: string;
  confirm: string;
}

/** RHF error → Astryx field status. */
function statusOf(err?: RhfFieldError) {
  return err?.message ? { type: "error" as const, message: err.message } : undefined;
}

/**
 * First-run wizard — reachable only while no user exists (the backend
 * refuses POST /api/setup forever once the installation has an admin).
 */
export default function SetupPage() {
  const navigate = useNavigate();
  const { setSession, status, hydrate } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const { data: setupStatus, isLoading } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => setupApi.status(),
    retry: false,
  });
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => {
    if (setupStatus && !setupStatus.needs_setup) navigate("/login", { replace: true });
  }, [setupStatus, navigate]);
  useEffect(() => {
    if (status === "authenticated") navigate("/dashboard", { replace: true });
  }, [status, navigate]);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupForm>({
    defaultValues: { business_name: "", full_name: "", email: "", password: "", confirm: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: SetupForm) =>
      setupApi.complete({
        business_name: values.business_name,
        full_name: values.full_name,
        email: values.email,
        password: values.password,
      }),
    onSuccess: async (_data, values) => {
      // Log the new admin straight in — the wizard is their first login.
      try {
        const login = await authApi.login(values.email, values.password);
        setSession(login.user);
      } finally {
        navigate("/dashboard", { replace: true });
      }
    },
    onError: (err) => setError((err as Error).message),
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    if (values.password !== values.confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    mutation.mutate(values);
  });

  if (isLoading) return <div className="min-h-screen bg-surface-2" />;
  if (setupStatus && !setupStatus.needs_setup) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 bg-[radial-gradient(ellipse_at_top,rgb(var(--color-primary-500)/0.14),transparent_60%)] p-4">
      <div className="w-full max-w-md">
        <Card padding={8} elevation="high" width="100%">
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-primary shadow-md">
              <Flame className="h-7 w-7 text-neutral-950" />
            </div>
            <h1 className="text-h2 font-bold text-text-primary">Bienvenue sur Fuego</h1>
            <p className="text-center text-sm text-text-secondary">
              Première installation : créez votre commerce et le compte
              administrateur principal.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && <Banner status="error" title={error} />}

            <Controller
              name="business_name"
              control={control}
              rules={{
                required: "Nom du commerce requis",
                minLength: { value: 2, message: "Minimum 2 caractères" },
              }}
              render={({ field }) => (
                <TextInput
                  label="Nom du commerce"
                  placeholder="Ex : Imprimerie El Fuego"
                  value={field.value}
                  onChange={field.onChange}
                  htmlName={field.name}
                  hasAutoFocus
                  width="100%"
                  status={statusOf(errors.business_name)}
                />
              )}
            />

            <Controller
              name="full_name"
              control={control}
              rules={{
                required: "Nom complet requis",
                minLength: { value: 2, message: "Minimum 2 caractères" },
              }}
              render={({ field }) => (
                <TextInput
                  label="Votre nom complet (administrateur)"
                  placeholder="Ex : Ahmed Ben Salah"
                  autoComplete="name"
                  value={field.value}
                  onChange={field.onChange}
                  htmlName={field.name}
                  width="100%"
                  status={statusOf(errors.full_name)}
                />
              )}
            />

            <Controller
              name="email"
              control={control}
              rules={{
                required: "E-mail requis",
                pattern: { value: /\S+@\S+\.\S+/, message: "Adresse e-mail invalide" },
              }}
              render={({ field }) => (
                <TextInput
                  label="E-mail administrateur"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="admin@commerce.tn"
                  value={field.value}
                  onChange={field.onChange}
                  htmlName={field.name}
                  width="100%"
                  status={statusOf(errors.email)}
                />
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
              <Controller
                name="password"
                control={control}
                rules={{
                  required: "Mot de passe requis",
                  minLength: { value: 8, message: "8 caractères minimum" },
                }}
                render={({ field }) => (
                  <TextInput
                    label="Mot de passe"
                    type="password"
                    autoComplete="new-password"
                    placeholder="8 caractères min."
                    value={field.value}
                    onChange={field.onChange}
                    htmlName={field.name}
                    width="100%"
                    status={statusOf(errors.password)}
                  />
                )}
              />
              <Controller
                name="confirm"
                control={control}
                rules={{ required: "Confirmation requise" }}
                render={({ field }) => (
                  <TextInput
                    label="Confirmation"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Répétez le mot de passe"
                    value={field.value}
                    onChange={field.onChange}
                    htmlName={field.name}
                    width="100%"
                    status={statusOf(errors.confirm)}
                  />
                )}
              />
            </div>

            <Button
              label="Créer mon commerce"
              type="submit"
              variant="primary"
              width="100%"
              isLoading={mutation.isPending}
            >
              Créer mon commerce
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
