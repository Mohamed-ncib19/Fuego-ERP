import { useLocation } from "react-router-dom";
import { Settings as SettingsIcon, ShieldCheck, Users } from "lucide-react";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Icon } from "@astryxdesign/core/Icon";

/** The three admin screens grouped under the single "Paramètres" entry. */
export const SETTINGS_ROUTES = ["/settings", "/settings/users", "/audit"];

const tabs = [
  { to: "/settings", label: "Commerce", icon: SettingsIcon },
  { to: "/settings/users", label: "Utilisateurs", icon: Users },
  { to: "/audit", label: "Journal d'audit", icon: ShieldCheck },
];

/** Link tabs (Astryx TabList): each tab is a real route. */
export function SettingsTabs() {
  const { pathname } = useLocation();
  return (
    <TabList value={pathname} onChange={() => undefined} hasDivider>
      {tabs.map((t) => (
        <Tab
          key={t.to}
          value={t.to}
          href={t.to}
          label={t.label}
          icon={<Icon icon={t.icon} size="sm" />}
        />
      ))}
    </TabList>
  );
}
