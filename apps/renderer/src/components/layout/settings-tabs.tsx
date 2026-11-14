import { NavLink } from "react-router-dom";
import { Settings as SettingsIcon, ShieldCheck, Users } from "lucide-react";

/** The three admin screens grouped under the single "Paramètres" entry. */
export const SETTINGS_ROUTES = ["/settings", "/settings/users", "/audit"];

const tabs = [
  { to: "/settings", label: "Commerce", icon: SettingsIcon },
  { to: "/settings/users", label: "Utilisateurs", icon: Users },
  { to: "/audit", label: "Journal d'audit", icon: ShieldCheck },
];

export function SettingsTabs() {
  return (
    <div className="flex gap-1 border-b border-border bg-surface px-6">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            `-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? "border-primary font-medium text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`
          }
        >
          <tab.icon className="h-4 w-4" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
