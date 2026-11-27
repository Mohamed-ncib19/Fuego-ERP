import { useEffect, useState } from "react";
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
  Boxes,
  Package,
  Layers,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth-store";
import { useStockItems } from "@/hooks/use-stock";
import { authApi } from "@/lib/api/auth.api";
import { roleLabel } from "@/lib/format";
import { Button } from "@/components/ui";
import { SETTINGS_ROUTES, SettingsTabs } from "@/components/layout/settings-tabs";

interface NavLeaf {
  to: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
  /** Alert count shown next to the label. */
  badge?: "stock";
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  /** Routes that keep the group highlighted. */
  prefix: string;
  children: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

/**
 * Users and the audit journal live as tabs inside "Paramètres" (admin);
 * Stock is the one group, with its two sub-pages.
 */
const nav: NavEntry[] = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/commandes", label: "Commandes", icon: ClipboardList },
  { to: "/finances", label: "Finances", icon: Wallet },
  {
    label: "Stock",
    icon: Boxes,
    prefix: "/stock",
    children: [
      { to: "/stock", label: "Gestion du stock", icon: Package, badge: "stock" },
      { to: "/stock/matieres", label: "Matières premières", icon: Layers },
    ],
  },
  { to: "/settings", label: "Paramètres", icon: SettingsIcon, admin: true },
];

const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

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
  const [navOpen, setNavOpen] = useState(false);

  // Items needing attention (low + out) — the sidebar's stock alert.
  const stockQ = useStockItems({});
  const stockAlerts = stockQ.data ? stockQ.data.summary.low + stockQ.data.summary.out : 0;

  useEffect(() => setNavOpen(false), [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/commandes/new");
      }
      if (e.key === "Escape") setNavOpen(false);
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

  const linkClass = (active: boolean, nested = false) =>
    `flex items-center gap-3 rounded-btn border-l-2 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
      nested ? "pl-9 pr-3" : "px-3"
    } ${
      active
        ? "border-primary bg-primary/10 font-medium text-primary"
        : "border-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary"
    }`;

  const renderLeaf = (item: NavLeaf, nested = false) => {
    if (item.admin && !isAdmin) return null;
    // "Paramètres" stays lit on its three tabs (users, audit).
    const forceActive = item.to === "/settings" && inSettings;
    const count = item.badge === "stock" ? stockAlerts : 0;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end
        className={({ isActive }) => linkClass(isActive || forceActive, nested)}
      >
        {!nested && <item.icon className="h-4 w-4" />}
        <span className="flex-1">{item.label}</span>
        {count > 0 && (
          <span
            className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none text-warning"
            title={`${count} article(s) en stock bas ou en rupture`}
          >
            {count}
          </span>
        )}
      </NavLink>
    );
  };

  const sidebar = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface lg:w-60">
      <div className="flex items-center justify-between gap-2.5 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-card bg-primary">
            <Flame className="h-5 w-5 text-neutral-950" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">Fuego</p>
            <p className="text-xs text-text-secondary">Gestion de commerce</p>
          </div>
        </div>
        <button
          onClick={() => setNavOpen(false)}
          className="rounded-btn p-1.5 text-text-secondary hover:bg-surface-2 lg:hidden"
          aria-label="Fermer le menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Navigation principale">
        {nav.map((entry) => {
          if (!isGroup(entry)) return renderLeaf(entry);
          const groupActive = location.pathname.startsWith(entry.prefix);
          return (
            <div key={entry.label} className="pt-1" role="group" aria-label={entry.label}>
              <div
                className={`flex items-center gap-3 px-3 py-2 text-sm ${
                  groupActive ? "font-medium text-text-primary" : "text-text-secondary"
                }`}
              >
                <entry.icon className={`h-4 w-4 ${groupActive ? "text-primary" : ""}`} />
                <span>{entry.label}</span>
              </div>
              <div className="relative space-y-0.5">
                {/* Guide line tying the sub-pages to their group. */}
                <span className="absolute bottom-2 left-5 top-2 w-px bg-border" aria-hidden="true" />
                {entry.children.map((c) => renderLeaf(c, true))}
              </div>
            </div>
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
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar: fixed column from lg, slide-over drawer below. */}
      <div className="hidden lg:flex">{sidebar}</div>
      {navOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNavOpen(false)} />
          <div className="relative z-10 h-full" style={{ animation: "nav-in 200ms cubic-bezier(0.24, 1, 0.4, 1)" }}>
            {sidebar}
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-btn p-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-h3 font-bold text-text-primary sm:text-h2">{title}</h1>
              {subtitle && <p className="hidden truncate text-sm text-text-secondary sm:block">{subtitle}</p>}
            </div>
          </div>
          {/* The one global action — hidden while already creating an order. */}
          {!onOrderForm && (
            <Button
              variant="primary"
              className="shrink-0 px-3 sm:px-4"
              onClick={() => navigate("/commandes/new")}
              title="Créer une commande (Ctrl+N)"
              aria-label="Nouvelle commande"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nouvelle commande</span>
            </Button>
          )}
        </header>
        {inSettings && isAdmin && <SettingsTabs />}
        <main className="flex-1 overflow-y-auto bg-surface-2 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
