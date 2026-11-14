import { useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Flame,
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Settings as SettingsIcon,
  Users,
  UserCircle,
  LogOut,
  Moon,
  Sun,
  Plus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth-store";
import { authApi } from "@/lib/api/auth.api";
import { roleLabel } from "@/lib/format";
import { Badge, Button } from "@/components/ui";

const navItems = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, soon: false, admin: false },
  { to: "/commandes", label: "Commandes", icon: ClipboardList, soon: false, admin: false },
  { to: "/finances", label: "Finances", icon: Wallet, soon: true, admin: false },
  { to: "/settings/users", label: "Utilisateurs", icon: Users, soon: false, admin: true },
  { to: "/settings", label: "Paramètres", icon: SettingsIcon, soon: false, admin: true },
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
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "super_admin";

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

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("fuego_theme", isDark ? "dark" : "light");
  };

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
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-card bg-primary">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">Fuego</p>
            <p className="text-xs text-text-secondary">Gestion de commerce</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) =>
            item.admin && !isAdmin ? null : item.soon ? (
              <div
                key={item.to}
                className="flex cursor-not-allowed items-center gap-3 rounded-btn px-3 py-2 text-sm text-text-secondary/50"
                title="Disponible dans une prochaine version"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase text-text-secondary/70">
                  Bientôt
                </span>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-btn px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        {/* User chip */}
        <div className="border-t border-border p-3">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-btn px-3 py-2 transition-colors ${
                isActive ? "bg-surface-2" : "hover:bg-surface-2"
              }`
            }
          >
            <UserCircle className="h-8 w-8 text-text-secondary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{user?.full_name}</p>
              <p className="text-xs text-text-secondary">{user && roleLabel[user.role]}</p>
            </div>
          </NavLink>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div>
            <h1 className="text-h2 font-bold text-text-primary">{title}</h1>
            {subtitle && <p className="text-sm text-text-secondary">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              className="h-9 px-3 text-xs"
              onClick={() => navigate("/commandes/new")}
              title="Créer une commande (Ctrl+N)"
            >
              <Plus className="h-4 w-4" />
              <span>Nouvelle commande</span>
            </Button>
            {isAdmin && <Badge tone="primary">Admin</Badge>}
            <button
              onClick={toggleTheme}
              className="rounded-btn border border-border bg-surface p-2 text-text-secondary hover:bg-surface-2"
              title="Thème clair / sombre"
            >
              <Sun className="hidden h-4 w-4 dark:block" />
              <Moon className="h-4 w-4 dark:hidden" />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-btn border border-border bg-surface px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 hover:text-danger"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-surface-2 p-6">{children}</main>
      </div>
    </div>
  );
}
