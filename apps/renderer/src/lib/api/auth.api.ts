import { apiGet, apiPost } from "./client";
import type { SafeUser } from "@fuego/shared";

export const authApi = {
  async login(email: string, password: string) {
    return apiPost<{ access_token: string; user: SafeUser }>("/auth/login", {
      email,
      password,
    });
  },
  me() {
    return apiGet<SafeUser>("/auth/me");
  },
  logout() {
    return apiPost("/auth/logout");
  },
  changePassword(current_password: string, new_password: string) {
    return apiPost<{ ok: boolean; message: string }>("/auth/change-password", {
      current_password,
      new_password,
    });
  },
};

export const setupApi = {
  async status() {
    return (await apiGet<{ needs_setup: boolean }>("/setup/status")).data;
  },
  async complete(payload: {
    business_name: string;
    full_name: string;
    email: string;
    password: string;
  }) {
    return apiPost<{ admin: SafeUser }>("/setup", payload);
  },
};

export interface AppSettings {
  id: string;
  business_name: string;
  currency: string;
  ticket_footer: string | null;
}

export const settingsApi = {
  async get() {
    return (await apiGet<AppSettings>("/settings")).data;
  },
};
