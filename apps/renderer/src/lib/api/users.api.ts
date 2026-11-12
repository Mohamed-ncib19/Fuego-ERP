import { apiGet, apiPatch, apiPost } from "./client";
import type { PageMeta, SafeUser, UserRole } from "@fuego/shared";

export interface UsersPage {
  data: SafeUser[];
  meta?: PageMeta;
}

export interface CreateUserInput {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  admin_password?: string;
}

export interface UpdateUserInput {
  full_name?: string;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
  admin_password?: string;
}

export const usersApi = {
  async list(params: { page?: number; limit?: number; search?: string }) {
    const res = await apiGet<SafeUser[], PageMeta>("/users", params as Record<string, unknown>);
    return { data: res.data, meta: res.meta };
  },
  create(payload: CreateUserInput) {
    return apiPost<SafeUser>("/users", payload);
  },
  update(id: string, payload: UpdateUserInput) {
    return apiPatch<SafeUser>(`/users/${id}`, payload);
  },
  resetPassword(id: string, new_password: string) {
    return apiPost<{ ok: boolean; message: string }>(`/users/${id}/reset-password`, {
      new_password,
    });
  },
};
