import { useEffect, useMemo, useState } from "react";
import { Users as UsersIcon, Plus, Search } from "lucide-react";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { MoreMenu as AxMoreMenu } from "@astryxdesign/core/MoreMenu";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PasswordField } from "@/components/password-field";
import {
  Button,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "@/components/ui";
import { useUsers, useUserMutations } from "@/hooks/use-queries";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth-store";
import { formatDate, roleLabel } from "@/lib/format";
import { USER_ROLES, type SafeUser, type UserRole } from "@fuego/shared";

type Row = SafeUser & Record<string, unknown>;

const PAGE_SIZE = 20;
const ROLE_OPTIONS = USER_ROLES.map((r) => ({ value: r, label: roleLabel[r] }));

function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={role === "super_admin" ? "primary" : "info"}>{roleLabel[role]}</Badge>;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>;
}

export default function UsersSettingsPage() {
  const { user: me } = useAuthStore();
  const toast = useToast();
  const { create, update, resetPassword } = useUserMutations();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useUsers({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SafeUser | null>(null);
  const [resetTarget, setResetTarget] = useState<SafeUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<SafeUser | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<SafeUser | null>(null);

  const users = useMemo(() => (data?.data ?? []) as Row[], [data]);
  const meta = data?.meta;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const menuItems = (u: SafeUser): DropdownMenuOption[] => {
    const isMe = u.id === me?.id;
    return [
      {
        label: "Modifier",
        onClick: () => {
          setEditing(u);
          setFormOpen(true);
        },
      },
      {
        label: "Réinitialiser le mot de passe",
        isDisabled: isMe,
        description: isMe ? "Changez le vôtre depuis « Mon profil »" : undefined,
        onClick: () => setResetTarget(u),
      },
      ...(!isMe
        ? [
            { type: "divider" as const },
            u.is_active
              ? {
                  label: "Désactiver le compte",
                  variant: "destructive" as const,
                  onClick: () => setDeactivateTarget(u),
                }
              : { label: "Réactiver le compte", onClick: () => setReactivateTarget(u) },
          ]
        : []),
    ];
  };

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: "full_name",
        header: "Nom",
        width: proportional(2),
        renderCell: (u) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-text-primary">{u.full_name}</span>
            {u.id === me?.id && <Badge tone="neutral">vous</Badge>}
          </span>
        ),
      },
      {
        key: "email",
        header: "E-mail",
        width: proportional(2),
        renderCell: (u) => (
          <Text color="secondary" maxLines={1}>
            {u.email}
          </Text>
        ),
      },
      {
        key: "role",
        header: "Rôle",
        width: pixel(150),
        renderCell: (u) => <RoleBadge role={u.role} />,
      },
      {
        key: "is_active",
        header: "Statut",
        width: pixel(120),
        renderCell: (u) => <StatusBadge active={u.is_active} />,
      },
      {
        key: "created_at",
        header: "Créé le",
        width: pixel(130),
        renderCell: (u) => (
          <Text color="secondary" hasTabularNumbers>
            {formatDate(u.created_at)}
          </Text>
        ),
      },
      {
        key: "actions",
        header: "",
        width: pixel(64),
        align: "end",
        renderCell: (u) => (
          <AxMoreMenu
            size="sm"
            label={`Actions pour ${u.full_name}`}
            alignment="end"
            items={menuItems(u)}
          />
        ),
      },
    ],
    // menuItems only closes over `me` and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.id],
  );

  return (
    <DashboardShell
      title="Utilisateurs"
      subtitle="Créez et gérez les comptes qui accèdent à l'application"
      actions={
        <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Nouvel utilisateur
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="w-full sm:w-[320px]">
          <TextInput
            label="Rechercher un utilisateur"
            isLabelHidden
            type="search"
            placeholder="Rechercher un nom ou e-mail…"
            startIcon={<Icon icon={Search} size="sm" />}
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            hasClear
            width="100%"
          />
        </div>

        <Card padding={0}>
          {isLoading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
          ) : users.length === 0 ? (
            search ? (
              <EmptyState
                title="Aucun utilisateur ne correspond"
                action={
                  <Button variant="secondary" onClick={() => setSearch("")}>
                    Effacer la recherche
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<UsersIcon className="h-10 w-10" />}
                title="Aucun utilisateur"
                description="Créez le premier compte employé pour commencer."
                action={
                  <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                    Nouvel utilisateur
                  </Button>
                }
              />
            )
          ) : (
            <>
              {/* Table from md; a stacked list on phones. */}
              <div className="hidden md:block">
                <Table<Row>
                  data={users}
                  columns={columns}
                  idKey="id"
                  hasHover
                  verticalAlign="middle"
                />
              </div>
              <ul className="divide-y divide-border md:hidden">
                {users.map((u) => (
                  <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-text-primary">
                          {u.full_name}
                        </span>
                        {u.id === me?.id && <Badge tone="neutral">vous</Badge>}
                      </span>
                      <Text type="supporting" color="secondary" maxLines={1}>
                        {u.email}
                      </Text>
                      <span className="flex flex-wrap gap-1.5">
                        <RoleBadge role={u.role} />
                        <StatusBadge active={u.is_active} />
                      </span>
                    </div>
                    <AxMoreMenu
                      size="sm"
                      label={`Actions pour ${u.full_name}`}
                      alignment="end"
                      items={menuItems(u)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {meta && meta.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text type="supporting" color="secondary">
              {meta.total} utilisateur(s) · page {meta.page} / {meta.totalPages}
            </Text>
            <Pagination
              page={page}
              totalPages={meta.totalPages}
              totalItems={meta.total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      <UserFormModal
        open={formOpen}
        editing={editing}
        meId={me?.id ?? null}
        onClose={() => setFormOpen(false)}
        onSubmit={async (values, adminPassword) => {
          try {
            if (editing) {
              await update.mutateAsync({
                id: editing.id,
                payload: {
                  full_name: values.full_name,
                  email: values.email,
                  // Sending the role revokes that user's sessions server-side:
                  // only send it when it actually changes.
                  role: values.role !== editing.role ? values.role : undefined,
                  admin_password: adminPassword,
                },
              });
              toast.success("Utilisateur modifié");
            } else {
              await create.mutateAsync({
                full_name: values.full_name,
                email: values.email!,
                password: values.password!,
                role: values.role!,
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

      {/* Reactivate confirm */}
      <ConfirmDialog
        open={!!reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        title="Réactiver ce compte ?"
        message={`${reactivateTarget?.full_name} pourra de nouveau se connecter avec son mot de passe actuel.`}
        confirmLabel="Réactiver"
        loading={update.isPending}
        onConfirm={async () => {
          if (!reactivateTarget) return;
          try {
            await update.mutateAsync({
              id: reactivateTarget.id,
              payload: { is_active: true },
            });
            toast.success("Compte réactivé");
          } catch (err) {
            toast.error((err as Error).message);
          }
          setReactivateTarget(null);
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
  /** Omitted when editing your own account (it can't change here). */
  email?: string;
  password?: string;
  /** Omitted when editing your own account (it can't change here). */
  role?: UserRole;
}

type FormErrors = Partial<Record<"full_name" | "email" | "password" | "admin_password", string>>;

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
  onSubmit: (values: UserFormValues, adminPassword?: string) => Promise<void>;
  pending: boolean;
}) {
  const isEdit = !!editing;
  const isSelf = editing?.id === meId;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [adminPassword, setAdminPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  // Re-seed the form each time the modal opens with a different target.
  useEffect(() => {
    if (!open) return;
    setFullName(editing?.full_name ?? "");
    setEmail(editing?.email ?? "");
    setPassword("");
    setRole(editing?.role ?? "staff");
    setAdminPassword("");
    setErrors({});
  }, [editing, open]);

  // Creating an admin, or promoting someone to admin, needs your own password.
  const needsAdminPassword = role === "super_admin" && (!isEdit || editing?.role !== "super_admin");

  const clearError = (key: keyof FormErrors) => setErrors((x) => ({ ...x, [key]: undefined }));

  const submit = () => {
    const e: FormErrors = {};
    if (!fullName.trim()) e.full_name = "Nom complet requis";
    else if (fullName.trim().length < 2) e.full_name = "Minimum 2 caractères";
    if (!isSelf) {
      if (!email.trim()) e.email = "E-mail requis";
      else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Adresse e-mail invalide";
    }
    if (!isEdit && password.length < 8)
      e.password = "Le mot de passe doit contenir au moins 8 caractères";
    if (needsAdminPassword && !adminPassword)
      e.admin_password = "Votre propre mot de passe est requis pour créer/modifier un administrateur";
    setErrors(e);
    if (Object.keys(e).length) return;
    void onSubmit(
      {
        full_name: fullName,
        email: isSelf ? undefined : email,
        password: isEdit ? undefined : password,
        role: isSelf ? undefined : role,
      },
      needsAdminPassword ? adminPassword : undefined,
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
      subtitle={isEdit ? editing?.email : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="user-form" loading={pending}>
            {isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <TextInput
          label="Nom complet"
          value={fullName}
          onChange={(v) => {
            setFullName(v);
            clearError("full_name");
          }}
          isRequired
          hasAutoFocus
          status={errors.full_name ? { type: "error", message: errors.full_name } : undefined}
          width="100%"
        />
        <TextInput
          label="E-mail"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(v) => {
            setEmail(v);
            clearError("email");
          }}
          isRequired={!isSelf}
          isDisabled={isSelf}
          description={isSelf ? "Votre propre e-mail ne peut pas être modifié ici." : undefined}
          status={errors.email ? { type: "error", message: errors.email } : undefined}
          width="100%"
        />
        {!isEdit && (
          <PasswordField
            label="Mot de passe"
            placeholder="8 caractères minimum"
            autoComplete="new-password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              clearError("password");
            }}
            isRequired
            error={errors.password}
          />
        )}
        <Selector
          label="Rôle"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(v) => {
            if (!v) return;
            setRole(v as UserRole);
            clearError("admin_password");
          }}
          isDisabled={isSelf}
          description={isSelf ? "Vous ne pouvez pas modifier votre propre rôle." : undefined}
          width="100%"
        />
        {needsAdminPassword && (
          <PasswordField
            label="Votre mot de passe (confirmation admin)"
            placeholder="Votre propre mot de passe"
            autoComplete="current-password"
            description="La création ou la promotion d'un administrateur exige votre propre mot de passe."
            value={adminPassword}
            onChange={(v) => {
              setAdminPassword(v);
              clearError("admin_password");
            }}
            isRequired
            error={errors.admin_password}
          />
        )}
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

  useEffect(() => {
    setPassword("");
    setError(null);
  }, [target]);

  const submit = async () => {
    if (password.length < 8) {
      setError("8 caractères minimum");
      return;
    }
    setError(null);
    await onSubmit(password);
    setPassword("");
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Réinitialiser le mot de passe"
      subtitle={target?.full_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="reset-password-form" loading={pending}>
            Réinitialiser
          </Button>
        </>
      }
    >
      <form
        id="reset-password-form"
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Text color="secondary" display="block">
          {target?.full_name} devra utiliser ce nouveau mot de passe à sa prochaine connexion. Ses
          sessions actives seront révoquées.
        </Text>
        <PasswordField
          label="Nouveau mot de passe"
          placeholder="8 caractères minimum"
          autoComplete="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setError(null);
          }}
          isRequired
          hasAutoFocus
          error={error ?? undefined}
        />
      </form>
    </Modal>
  );
}
