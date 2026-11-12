import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { usersApi } from "@/lib/api/users.api";
import { settingsApi } from "@/lib/api/auth.api";
import { apiGet } from "@/lib/api/client";

/** Query keys in one place so mutations invalidate exactly what changed. */
export const qk = {
  users: (params: Record<string, unknown>) => ["users", params] as const,
  settings: ["settings"] as const,
  audit: (params: Record<string, unknown>) => ["audit", params] as const,
};

export function useUsers(params: { page?: number; limit?: number; search?: string }) {
  return useQuery({
    queryKey: qk.users(params),
    queryFn: () => usersApi.list(params),
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };
  const create = useMutation({ mutationFn: usersApi.create, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, payload),
    onSuccess: invalidate,
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      usersApi.resetPassword(id, newPassword),
    onSuccess: invalidate,
  });
  return { create, update, resetPassword };
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => settingsApi.get() });
}

export function useAudit(params: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: qk.audit(params),
    queryFn: () =>
      apiGet<
        Array<{
          id: string;
          action: string;
          entity_type: string;
          entity_label: string | null;
          actor_label: string | null;
          created_at: string;
        }>
      >("/audit", params as Record<string, unknown>),
  });
}
