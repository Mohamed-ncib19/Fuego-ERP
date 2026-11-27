import {
  Children,
  isValidElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  forwardRef,
} from "react";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { Text as AxText } from "@astryxdesign/core/Text";
import { Card as AxCard } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Drawer as AxDrawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { EmptyState as AxEmptyState } from "@astryxdesign/core/EmptyState";
import { Skeleton as AxSkeleton } from "@astryxdesign/core/Skeleton";
import { Spinner as AxSpinner } from "@astryxdesign/core/Spinner";
import { StatusDot as AxStatusDot } from "@astryxdesign/core/StatusDot";
import { Banner } from "@astryxdesign/core/Banner";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { MoreMenu as AxMoreMenu } from "@astryxdesign/core/MoreMenu";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { PHONE_PREFIX, formatPhoneLocal, normalizePhone } from "@fuego/shared";

/* ---------------------------------------------------------------------------
 * Fuego's UI kit, built on the Astryx design system. Every page imports from
 * here, so the props stay the ones the app has always used; underneath, each
 * primitive is the Astryx component (Button, Dialog, Drawer, Badge…).
 * Form fields that are wired to react-hook-form stay native elements with
 * the Astryx field styling (`.fuego-field`, see index.css).
 * ------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const AX_VARIANT = {
  primary: "primary",
  secondary: "secondary",
  danger: "destructive",
  ghost: "ghost",
} as const;

/** Plain text of a children tree — the accessible label Astryx requires. */
function textOf(node: ReactNode): string {
  let out = "";
  Children.forEach(node, (c) => {
    if (typeof c === "string" || typeof c === "number") out += c;
    else if (isValidElement<{ children?: ReactNode }>(c)) out += textOf(c.props.children);
  });
  return out.replace(/\s+/g, " ").trim();
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  onClick,
  title,
  form,
  icon,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  /** Leading icon (a lucide element). */
  icon?: ReactNode;
}) {
  const label = rest["aria-label"] || textOf(children) || title || "Action";
  // Pages write `<Button><Plus /> Nouveau</Button>`: the leading icon element
  // goes to Astryx's icon slot (aligned, sized) and the rest stays the label.
  // A trailing icon (`Ouvrir <ArrowRight />`) goes to the end slot the same way.
  const isIcon = (n: ReactNode) => isValidElement(n) && typeof n.type !== "string";
  let leading = icon;
  let trailing: ReactNode = undefined;
  let parts = Children.toArray(children);
  if (!leading && parts.length >= 1 && isIcon(parts[0])) {
    leading = parts[0];
    parts = parts.slice(1);
  }
  if (parts.length > 1 && isIcon(parts[parts.length - 1])) {
    trailing = parts[parts.length - 1];
    parts = parts.slice(0, -1);
  }
  const content: ReactNode = parts.length ? parts : null;
  const iconOnly = !textOf(content);
  return (
    <AxButton
      label={label}
      isIconOnly={iconOnly && Boolean(leading)}
      variant={AX_VARIANT[variant]}
      size={size}
      isLoading={loading}
      isDisabled={disabled}
      type={type}
      onClick={onClick}
      tooltip={title}
      form={form}
      icon={leading}
      endContent={trailing}
      className={className}
      data-testid={rest["data-testid" as keyof typeof rest] as string | undefined}
    >
      {iconOnly ? undefined : content}
    </AxButton>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className = "", invalid = false, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || rest["aria-invalid"] || undefined}
      className={`fuego-field ${className}`}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`fuego-field ${className}`} {...rest}>
        {children}
      </select>
    );
  },
);

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text-primary">
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-danger" role="alert">
      {message}
    </p>
  );
}

/** Astryx Card; padding comes from `className` like everywhere else in the app. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <AxCard padding={0} className={className}>
      {children}
    </AxCard>
  );
}

const BADGE_VARIANT = {
  neutral: "neutral",
  success: "success",
  danger: "error",
  warning: "warning",
  info: "info",
  primary: "yellow",
} as const;

export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_VARIANT;
  icon?: ReactNode;
}) {
  return <AxBadge label={children} variant={BADGE_VARIANT[tone]} icon={icon} />;
}

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  return <AxSpinner size={size} aria-label="Chargement" />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      <AxSpinner size="xl" aria-label="Chargement" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** The next step, e.g. a "create the first item" button. */
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "py-6" : "py-12"}>
      <AxEmptyState
        title={title}
        description={description}
        icon={icon}
        actions={action}
        isCompact={compact}
      />
    </div>
  );
}

/** Placeholder block shown while data loads (keeps the layout from jumping). */
export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
}) {
  return (
    <span className={`block ${className}`}>
      <AxSkeleton width={width ?? "100%"} height={height ?? "100%"} />
    </span>
  );
}

/** Table-shaped loading state: `rows` lines of muted bars. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <span key={c} className={c === 0 ? "w-1/4" : "flex-1"}>
              <AxSkeleton height={14} index={r} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A query that failed: Astryx error banner with a retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4">
      <Banner
        status="error"
        title="Impossible de charger les données"
        description={message}
        endContent={
          onRetry ? <AxButton label="Réessayer" size="sm" onClick={onRetry} /> : undefined
        }
      />
    </div>
  );
}

const DOT_VARIANT = {
  success: "success",
  warning: "warning",
  danger: "error",
  neutral: "neutral",
  accent: "accent",
} as const;

/** Coloured dot + text — status is never colour alone. */
export function StatusDot({
  tone,
  children,
}: {
  tone: keyof typeof DOT_VARIANT;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <AxStatusDot variant={DOT_VARIANT[tone]} label={textOf(children)} />
      <span className="text-text-primary">{children}</span>
    </span>
  );
}

/** Mutually exclusive views inside a page (Finances, Stock). */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  label = "Vue",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label?: string;
}) {
  return (
    <SegmentedControl value={value} onChange={(v) => onChange(v as T)} label={label}>
      {options.map((o) => (
        <SegmentedControlItem
          key={o.value}
          value={o.value}
          label={o.count ? `${o.label} (${o.count})` : o.label}
        />
      ))}
    </SegmentedControl>
  );
}

/** Side panel for a detail view that keeps the list in sight. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <AxDrawer
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      label={title}
      width={width}
    >
      <Layout
        header={<DrawerHeader title={title} subtitle={subtitle} onOpenChange={() => onClose()} hasDivider />}
        content={<LayoutContent>{children}</LayoutContent>}
        footer={footer ? <LayoutFooter hasDivider>{footer}</LayoutFooter> : undefined}
      />
    </AxDrawer>
  );
}

const MODAL_WIDTH: Record<string, number> = {
  "max-w-sm": 400,
  "max-w-md": 460,
  "max-w-lg": 540,
  "max-w-xl": 600,
  "max-w-2xl": 680,
  "max-w-3xl": 780,
  "max-w-4xl": 900,
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-md",
  purpose = "form",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Action row pinned under the scrolling body. */
  footer?: ReactNode;
  /** Tailwind max-width name or a pixel width. */
  width?: string | number;
  purpose?: "form" | "info" | "required";
}) {
  const px = typeof width === "number" ? width : (MODAL_WIDTH[width] ?? 460);
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      width={`min(${px}px, calc(100vw - 32px))`}
      maxHeight="calc(100dvh - 48px)"
      purpose={purpose}
    >
      <Layout
        height="auto"
        header={<DialogHeader title={title} subtitle={subtitle} onOpenChange={() => onClose()} />}
        content={<LayoutContent>{children}</LayoutContent>}
        footer={
          footer ? (
            <LayoutFooter hasDivider>
              <div className="flex w-full flex-wrap items-center justify-end gap-2">{footer}</div>
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmer",
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={message}
      actionLabel={confirmLabel}
      cancelLabel="Annuler"
      actionVariant={danger ? "destructive" : "primary"}
      isActionLoading={loading}
      onAction={onConfirm}
    />
  );
}

export interface MoreMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown under the label — typically why the item is disabled. */
  hint?: string;
}

/**
 * Secondary actions tucked behind one button, so a screen keeps a single
 * obvious main action.
 */
export function MoreMenu({
  items,
  label = "Plus d'actions",
  placement = "down",
}: {
  items: MoreMenuItem[];
  label?: string;
  /** "up" for menus anchored at the bottom of a panel. */
  placement?: "down" | "up";
}) {
  if (items.length === 0) return null;
  return (
    <AxMoreMenu
      label={label}
      variant="secondary"
      placement={placement === "up" ? "above" : "below"}
      alignment="end"
      items={items.map((i) => ({
        label: i.label,
        icon: i.icon,
        description: i.hint,
        isDisabled: i.disabled,
        variant: i.danger ? "destructive" : undefined,
        onClick: i.onClick,
      }))}
    />
  );
}

/**
 * Tunisian phone field: the +216 prefix is fixed, the user types the 8
 * national digits and sees them grouped "xx xxx xxx". `value` / `onChange`
 * carry the bare digits ("22123456").
 */
export function PhoneInput({
  value,
  onChange,
  invalid = false,
}: {
  value: string;
  onChange: (digits: string) => void;
  invalid?: boolean;
}) {
  return (
    <div
      className="fuego-field flex items-center !px-0"
      aria-invalid={invalid || undefined}
    >
      <span className="select-none border-r border-border px-3 font-medium text-[var(--color-text-accent)]">
        {PHONE_PREFIX}
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        placeholder="22 123 456"
        value={formatPhoneLocal(value)}
        onChange={(e) => onChange(normalizePhone(e.target.value))}
        className="h-full w-full bg-transparent px-3 tracking-wide text-text-primary outline-none"
      />
    </div>
  );
}

const TILE_TONE = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
  primary: "text-primary",
} as const;

/** KPI tile used across pages: small label, large tabular number, optional hint. */
export function SummaryTile({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof TILE_TONE;
  className?: string;
}) {
  return (
    <AxCard padding={4} className={className}>
      <AxText type="supporting" color="secondary" display="block">
        {label}
      </AxText>
      <span
        className={`mt-1 block text-[26px] font-semibold leading-tight tabular-nums ${tone ? TILE_TONE[tone] : ""}`}
      >
        {value}
      </span>
      {hint && (
        <AxText type="supporting" color="secondary" display="block">
          {hint}
        </AxText>
      )}
    </AxCard>
  );
}
