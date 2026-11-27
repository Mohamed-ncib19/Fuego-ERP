import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import frFR from "@astryxdesign/core/locales/fr-FR.generated.js";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/**
 * Astryx renders plain <a href> for SideNavItem, Button href, Tab href… This
 * adapter routes internal paths through React Router (no full reload, which
 * would also drop the in-memory session) and leaves external links alone.
 */
const AppLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function AppLink({ href = "", ...rest }, ref) {
    if (/^(https?:|mailto:|tel:)/.test(href)) return <a ref={ref} href={href} {...rest} />;
    return <RouterLink ref={ref} to={href} {...rest} />;
  },
);

/**
 * Root of the design system: Neutral theme in dark mode (Fuego is dark only),
 * French for every built-in Astryx string and date, router-aware links.
 */
/** Strings the 0.7.17 French catalog still leaves in English. */
const FR_MESSAGES = {
  ...frFR,
  "@astryx.field.labelTooltip": "À propos de « {label} »",
};

export function AstryxProvider({ children }: { children: ReactNode }) {
  return (
    <InternationalizationProvider locale="fr-FR" messages={{ "fr-FR": FR_MESSAGES }}>
      <Theme theme={neutralTheme} mode="dark">
        <LinkProvider component={AppLink}>{children}</LinkProvider>
      </Theme>
    </InternationalizationProvider>
  );
}
