import { useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Flame,
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Settings as SettingsIcon,
  UserCircle,
  LogOut,
  Plus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth-store";
import { authApi } from "@/lib/api/auth.api";
import { roleLabel } from "@/lib/format";
import { Button } from "@/components/ui";
import { SETTINGS_ROUTES, SettingsTabs } from "@/components/layout/settings-tabs";

/**
 * Four destinations only. Users and the audit journal live as tabs inside
 * "Paramètres" (admin) so the counter staff sees three entries.
 */
const navItems = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, admin: false },
  { to: "/commandes", label: "Commandes", icon: ClipboardList, admin: false },
  { to: "/finances", label: "Finances", icon: Wallet, admin: false },
  { to: "/settings", label: "Paramètres", icon: SettingsIcon, admin: true },
];

export function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { user, clear } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "super_admin";
  const inSettings = SETTINGS_ROUTES.includes(location.pathname);
  const onOrderForm = location.pathname === "/commandes/new";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/commandes/new");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clear();
      queryClient.clear();
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-card bg-primary">
            <Flame className="h-5 w-5 text-neutral-950" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">Fuego</p>
            <p className="text-xs text-text-secondary">Gestion de commerce</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            if (item.admin && !isAdmin) return null;
            // "Paramètres" stays lit on its three tabs (users, audit).
            const forceActive = item.to === "/settings" && inSettings;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-btn border-l-2 px-3 py-2.5 text-sm transition-colors ${
                    isActive || forceActive
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User chip: profile + logout in one place */}
        <div className="flex items-center gap-1 border-t border-border p-3">
          <NavLink
            to="/profile"
            title="Mon profil"
            className={({ isActive }) =>
              `flex min-w-0 flex-1 items-center gap-3 rounded-btn px-2 py-2 transition-colors ${
                isActive ? "bg-surface-2" : "hover:bg-surface-2"
              }`
            }
          >
            <UserCircle className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{user?.full_name}</p>
              <p className="text-xs text-text-secondary">{user && roleLabel[user.role]}</p>
            </div>
          </NavLink>
          <button
            onClick={logout}
            className="rounded-btn p-2 text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-h2 font-bold text-text-primary">{title}</h1>
            {subtitle && <p className="truncate text-sm text-text-secondary">{subtitle}</p>}
          </div>
          {/* The one global action — hidden while already creating an order. */}
          {!onOrderForm && (
            <Button
              variant="primary"
              className="shrink-0"
              onClick={() => navigate("/commandes/new")}
              title="Créer une commande (Ctrl+N)"
            >
              <Plus className="h-4 w-4" />
              <span>Nouvelle commande</span>
            </Button>
          )}
        </header>
        {inSettings && isAdmin && <SettingsTabs />}
        <main className="flex-1 overflow-y-auto bg-surface-2 p-6">{children}</main>
      </div>
    </div>
  );
}
