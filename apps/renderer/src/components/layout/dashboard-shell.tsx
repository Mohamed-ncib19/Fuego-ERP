import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { useAuthStore } from "@/hooks/use-auth-store";
import { useStockItems } from "@/hooks/use-stock";
import { authApi } from "@/lib/api/auth.api";
import { roleLabel } from "@/lib/format";
import { SETTINGS_ROUTES, SettingsTabs } from "@/components/layout/settings-tabs";

/** One flat list: five destinations, no nested groups to learn. */
const NAV = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/commandes", label: "Commandes", icon: ClipboardList },
  { to: "/finances", label: "Finances", icon: Wallet },
  { to: "/stock", label: "Stock", icon: Boxes, badge: "stock" as const },
  { to: "/settings", label: "Paramètres", icon: SettingsIcon, admin: true },
];

/**
 * Page frame on Astryx AppShell: side navigation (a drawer on small screens),
 * then the page heading with its actions, then the content.
 */
export function DashboardShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Page-level actions, right of the title (the page's main button first). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, clear } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "super_admin";
  const inSettings = SETTINGS_ROUTES.includes(pathname);

  // Items needing attention (low + out): the Stock entry's alert count.
  const stockQ = useStockItems({});
  const stockAlerts = stockQ.data ? stockQ.data.summary.low + stockQ.data.summary.out : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/commandes/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const isSelected = (to: string) =>
    to === "/settings" ? inSettings : pathname === to || pathname.startsWith(`${to}/`);

  const sideNav = (
    <SideNav
      header={
        <SideNavHeading
          heading="Fuego"
          subheading="Gestion de commerce"
          headingHref="/dashboard"
          icon={<NavIcon icon={<Icon icon={Flame} size="sm" />} />}
        />
      }
      topContent={
        pathname !== "/commandes/new" ? (
          <Button
            label="Nouvelle commande"
            variant="primary"
            width="100%"
            icon={<Icon icon={Plus} size="sm" />}
            tooltip="Ctrl+N"
            href="/commandes/new"
          />
        ) : undefined
      }
      footer={
        <SideNavSection title="Compte" isHeaderHidden>
          <SideNavItem
            label={user ? `${user.full_name} · ${roleLabel[user.role]}` : "Mon profil"}
            icon={UserCircle}
            href="/profile"
            isSelected={pathname === "/profile"}
          />
          <SideNavItem label="Se déconnecter" icon={LogOut} onClick={() => void logout()} />
        </SideNavSection>
      }
    >
      <SideNavSection title="Menu" isHeaderHidden>
        {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
          <SideNavItem
            key={n.to}
            label={n.label}
            icon={n.icon}
            href={n.to}
            isSelected={isSelected(n.to)}
            endContent={
              n.badge === "stock" && stockAlerts > 0 ? (
                <Badge variant="warning" label={String(stockAlerts)} />
              ) : undefined
            }
          />
        ))}
      </SideNavSection>
    </SideNav>
  );

  return (
    <AppShell sideNav={sideNav} contentPadding={0} height="fill" variant="wash">
      <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Heading level={1} maxLines={1}>
              {title}
            </Heading>
            {subtitle && (
              <Text type="supporting" color="secondary" display="block" maxLines={1}>
                {subtitle}
              </Text>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {inSettings && isAdmin && <SettingsTabs />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AppShell>
  );
}
