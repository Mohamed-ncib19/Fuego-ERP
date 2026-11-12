import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { Users as UsersIcon, Plus, Pencil, KeyRound, Search, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Button,
  Card,
  Input,
  Label,
  FieldError,
  Select,
  Badge,
  Modal,
  ConfirmDialog,
  PageLoader,
  EmptyState,
} from "@/components/ui";
import { useUsers, useUserMutations } from "@/hooks/use-queries";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth-store";
import { formatDate, roleLabel } from "@/lib/format";
import { USER_ROLES, type SafeUser, type UserRole } from "@fuego/shared";

export default function UsersSettingsPage() {
  const { user: me } = useAuthStore();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { create, update, resetPassword } = useUserMutations();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useUsers({ page, limit: 20, search: search || undefined });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SafeUser | null>(null);
  const [resetTarget, setResetTarget] = useState<SafeUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<SafeUser | null>(null);

  const users = useMemo(() => data?.data ?? [], [data]);
  const meta = data?.meta;

  return (
    <DashboardShell
      title="Utilisateurs"
      subtitle="Créez et gérez les comptes qui accèdent à l'application"
    >
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              placeholder="Rechercher un nom ou e-mail…"
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvel utilisateur
          </Button>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-10 w-10" />}
            title="Aucun utilisateur"
            description="Créez le premier compte employé pour commencer."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Rôle</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Créé le</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 hover:bg-surface-2/50">
                    <td className="px-3 py-3 font-medium text-text-primary">
                      <span className="flex items-center gap-2">
                        {u.full_name}
                        {u.role === "super_admin" && (
                          <span title="Administrateur">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                          </span>
                        )}
                        {u.id === me?.id && (
                          <Badge tone="info">vous</Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{u.email}</td>
                    <td className="px-3 py-3">
                      <Badge tone={u.role === "super_admin" ? "primary" : "info"}>
                        {roleLabel[u.role]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {u.is_active ? (
                        <Badge tone="success">Actif</Badge>
                      ) : (
                        <Badge tone="danger">Désactivé</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{formatDate(u.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded-btn p-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                          title="Modifier"
                          onClick={() => {
                            setEditing(u);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-btn p-2 text-text-secondary hover:bg-surface-2 hover:text-warning"
                          title="Réinitialiser le mot de passe"
                          onClick={() => setResetTarget(u)}
                          disabled={u.id === me?.id}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {u.is_active && u.id !== me?.id && (
                          <button
                            className="rounded-btn p-2 text-text-secondary hover:bg-surface-2 hover:text-danger"
                            title="Désactiver le compte"
                            onClick={() => setDeactivateTarget(u)}
                          >
                            <UsersIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
            <span>
              {meta.total} utilisateur(s) · page {meta.page} / {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <Button
                variant="secondary"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create / edit modal */}
      <UserFormModal
        open={formOpen}
        editing={editing}
        meId={me?.id ?? null}
        onClose={() => setFormOpen(false)}
        onSubmit={async (payload, adminPassword) => {
          try {
            if (editing) {
              await update.mutateAsync({
                id: editing.id,
                payload: { ...payload, admin_password: adminPassword },
              });
              toast.success("Utilisateur modifié");
            } else {
              await create.mutateAsync({
                full_name: payload.full_name,
                email: payload.email,
                password: payload.password!,
                role: payload.role,
                admin_password: adminPassword,
              });
              toast.success("Utilisateur créé");
            }
            setFormOpen(false);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        pending={create.isPending || update.isPending}
      />

      {/* Reset password modal */}
      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={async (newPassword) => {
          if (!resetTarget) return;
          try {
            await resetPassword.mutateAsync({ id: resetTarget.id, newPassword });
            toast.success("Mot de passe réinitialisé");
            setResetTarget(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        pending={resetPassword.isPending}
      />

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Désactiver ce compte ?"
        message={`${deactivateTarget?.full_name} ne pourra plus se connecter. Ses sessions actives seront révoquées immédiatement.`}
        confirmLabel="Désactiver"
        danger
        loading={update.isPending}
        onConfirm={async () => {
          if (!deactivateTarget) return;
          try {
            await update.mutateAsync({
              id: deactivateTarget.id,
              payload: { is_active: false },
            });
            toast.success("Compte désactivé");
            setDeactivateTarget(null);
          } catch (err) {
            toast.error((err as Error).message);
            setDeactivateTarget(null);
          }
        }}
      />
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// User create/edit form
// ---------------------------------------------------------------------------

interface UserFormValues {
  full_name: string;
  email: string;
  password?: string;
  role: UserRole;
  admin_password?: string;
}

function UserFormModal({
  open,
  editing,
  meId,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  editing: SafeUser | null;
  meId: string | null;
  onClose: () => void;
  onSubmit: (payload: UserFormValues, adminPassword?: string) => Promise<void>;
  pending: boolean;
}) {
  const isEdit = !!editing;
  const isSelf = editing?.id === meId;
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>();

  // Re-seed the form each time the modal opens with a different target.
  useMemo(() => {
    reset(
      editing
        ? { full_name: editing.full_name, email: editing.email, role: editing.role }
        : { full_name: "", email: "", password: "", role: "staff", admin_password: "" },
      { keepDefaultValues: false },
    );
    setError(null);
  }, [editing, open]);

  const role = watch("role");

  const submit = handleSubmit((values) => {
    setError(null);
    if (!isEdit && (!values.password || values.password.length < 8)) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    const needsAdminPassword =
      (!isEdit && values.role === "super_admin") ||
      (isEdit && values.role === "super_admin" && editing?.role !== "super_admin");
    if (needsAdminPassword && !values.admin_password) {
      setError("Votre propre mot de passe est requis pour créer/modifier un administrateur");
      return;
    }
    void onSubmit(
      {
        full_name: values.full_name,
        email: values.email,
        password: values.password!,
        role: values.role,
      },
      values.admin_password,
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label>Nom complet</Label>
          <Input {...register("full_name", { required: "Nom complet requis", minLength: { value: 2, message: "Minimum 2 caractères" } })} />
          <FieldError message={errors.full_name?.message as string | undefined} />
        </div>
        <div>
          <Label>E-mail</Label>
          <Input
            type="email"
            disabled={isSelf}
            {...register("email", {
              required: "E-mail requis",
              pattern: { value: /\S+@\S+\.\S+/, message: "Adresse e-mail invalide" },
            })}
          />
          <FieldError message={errors.email?.message as string | undefined} />
          {isSelf && <p className="mt-1 text-xs text-text-secondary">Votre propre e-mail ne peut pas être modifié ici.</p>}
        </div>
        {!isEdit && (
          <div>
            <Label>Mot de passe</Label>
            <Input
              type="password"
              placeholder="8 caractères minimum"
              {...register("password", { minLength: { value: 8, message: "8 caractères minimum" } })}
            />
            <FieldError message={errors.password?.message as string | undefined} />
          </div>
        )}
        <div>
          <Label>Rôle</Label>
          <Select disabled={isSelf} {...register("role", { required: true })}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </Select>
          {isSelf && (
            <p className="mt-1 text-xs text-text-secondary">
              Vous ne pouvez pas modifier votre propre rôle.
            </p>
          )}
        </div>
        {role === "super_admin" && (!isEdit || editing?.role !== "super_admin") && (
          <div>
            <Label>Votre mot de passe (confirmation admin)</Label>
            <Input
              type="password"
              placeholder="Votre propre mot de passe"
              {...register("admin_password")}
            />
            <p className="mt-1 text-xs text-text-secondary">
              La création ou la promotion d'un administrateur exige votre propre mot de passe.
            </p>
          </div>
        )}
        {error && (
          <div className="rounded-btn border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={pending}>
            {isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reset password form
// ---------------------------------------------------------------------------

function ResetPasswordModal({
  target,
  onClose,
  onSubmit,
  pending,
}: {
  target: SafeUser | null;
  onClose: () => void;
  onSubmit: (newPassword: string) => Promise<void>;
  pending: boolean;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={!!target} onClose={onClose} title={`Réinitialiser le mot de passe`}>
      <p className="mb-4 text-sm text-text-secondary">
        {target?.full_name} devra utiliser ce nouveau mot de passe à sa prochaine connexion.
        Ses sessions actives seront révoquées.
      </p>
      <Label>Nouveau mot de passe</Label>
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="8 caractères minimum"
      />
      {error && <FieldError message={error} />}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button
          loading={pending}
          onClick={async () => {
            if (password.length < 8) {
              setError("8 caractères minimum");
              return;
            }
            setError(null);
            await onSubmit(password);
            setPassword("");
          }}
        >
          Réinitialiser
        </Button>
      </div>
    </Modal>
  );
}
