import { create } from "zustand";
import { authApi } from "@/lib/api/auth.api";
import type { SafeUser } from "@fuego/shared";

/**
 * Session store — the JWT lives in an httpOnly cookie, so only the identity
 * is kept here. A localStorage marker (`fuego_session_ok`) remembers that a
 * session cookie may exist, so a stale-but-present cookie lands on /login
 * instead of an infinite login↔dashboard bounce, and the browser Back button
 * can never "log out" (reference middleware pattern).
 */
type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: SafeUser | null;
  status: AuthStatus;
  hydrate: () => Promise<void>;
  setSession: (user: SafeUser) => void;
  clear: () => void;
}

const MARKER = "fuego_session_ok";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",
  async hydrate() {
    const mayHaveSession = localStorage.getItem(MARKER) === "1";
    if (!mayHaveSession) {
      set({ user: null, status: "unauthenticated" });
      return;
    }
    try {
      const { data } = await authApi.me();
      set({ user: data, status: "authenticated" });
    } catch {
      localStorage.removeItem(MARKER);
      set({ user: null, status: "unauthenticated" });
    }
  },
  setSession(user) {
    localStorage.setItem(MARKER, "1");
    set({ user, status: "authenticated" });
  },
  clear() {
    localStorage.removeItem(MARKER);
    set({ user: null, status: "unauthenticated" });
  },
}));
