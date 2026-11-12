import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { authApi, setupApi } from "@/lib/api/auth.api";
import { useAuthStore } from "@/hooks/use-auth-store";
import { Button, Input, Label, FieldError } from "@/components/ui";

interface SetupForm {
  business_name: string;
  full_name: string;
  email: string;
  password: string;
  confirm: string;
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
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SetupForm>();

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-500 via-primary-700 to-primary-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-modal border border-border bg-surface p-8 shadow-hover">
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-primary shadow-md">
              <Flame className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-h2 font-bold text-text-primary">Bienvenue sur Fuego</h1>
            <p className="text-center text-sm text-text-secondary">
              Première installation : créez votre commerce et le compte
              administrateur principal.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-btn border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <Label>Nom du commerce</Label>
              <Input placeholder="Ex : Imprimerie El Fuego" {...register("business_name", { required: "Nom du commerce requis", minLength: { value: 2, message: "Minimum 2 caractères" } })} />
              <FieldError message={errors.business_name?.message as string | undefined} />
            </div>
            <div>
              <Label>Votre nom complet (administrateur)</Label>
              <Input placeholder="Ex : Ahmed Ben Salah" {...register("full_name", { required: "Nom complet requis", minLength: { value: 2, message: "Minimum 2 caractères" } })} />
              <FieldError message={errors.full_name?.message as string | undefined} />
            </div>
            <div>
              <Label>E-mail administrateur</Label>
              <Input type="email" placeholder="admin@commerce.tn" {...register("email", { required: "E-mail requis", pattern: { value: /\S+@\S+\.\S+/, message: "Adresse e-mail invalide" } })} />
              <FieldError message={errors.email?.message as string | undefined} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mot de passe</Label>
                <Input type="password" placeholder="8 caractères min." {...register("password", { required: "Mot de passe requis", minLength: { value: 8, message: "8 caractères minimum" } })} />
                <FieldError message={errors.password?.message as string | undefined} />
              </div>
              <div>
                <Label>Confirmation</Label>
                <Input type="password" placeholder="Répétez le mot de passe" {...register("confirm", { required: "Confirmation requise" })} />
                <FieldError message={errors.confirm?.message as string | undefined} />
              </div>
            </div>
            <Button type="submit" className="w-full" loading={mutation.isPending}>
              Créer mon commerce
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
