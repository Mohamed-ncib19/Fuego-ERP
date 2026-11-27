import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { Loader2, MoreHorizontal, X } from "lucide-react";
import { PHONE_PREFIX, formatPhoneLocal, normalizePhone } from "@fuego/shared";

/* ---------------------------------------------------------------------------
 * Minimal, token-driven UI kit — same philosophy as the reference ui/
 * components: tokens only, no hard-coded colors.
 * ------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-neutral-950 font-semibold hover:bg-primary-400 disabled:opacity-50",
  secondary:
    "bg-surface text-text-primary border border-border hover:bg-surface-2 disabled:opacity-60",
  danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25 disabled:opacity-60",
  ghost: "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-btn px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${buttonStyles[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Input({
  className = "",
  invalid = false,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`w-full rounded-btn border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 disabled:opacity-60 ${
        invalid ? "border-danger/70 focus:ring-danger/30" : "border-border focus:ring-primary/30"
      } ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text-primary">
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-danger">{message}</p>;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-border bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "info" | "primary";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-text-secondary border-border",
    success: "bg-success/10 text-success border-success/30",
    danger: "bg-danger/10 text-danger border-danger/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    info: "bg-info/10 text-info border-info/30",
    primary: "bg-primary/10 text-primary border-primary/30",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-primary ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional next step, e.g. a "create the first item" button. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      {icon && <div className="mb-3 text-text-secondary">{icon}</div>}
      <p className="text-h3 font-semibold text-text-primary">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Placeholder block shown while data loads (keeps the layout from jumping). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-border/50 ${className}`} />;
}

/** Table-shaped loading state: `rows` lines of muted bars. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={`h-3.5 ${c === 0 ? "w-1/4" : "flex-1"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Inline error block with a retry, for a query that failed. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center" role="alert">
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** Coloured dot + text — status is never colour alone. */
export function StatusDot({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
}) {
  const dot: Record<string, string> = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-text-secondary",
  };
  const text: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    neutral: "text-text-secondary",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${text[tone]}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Pill tab switcher used inside a page (Finances, Stock). */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div role="tablist" className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex shrink-0 items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            value === o.value
              ? "bg-surface text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span className="rounded-full bg-warning/15 px-1.5 text-[11px] font-semibold tabular-nums text-warning">
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Side panel anchored to the right: a detail view that keeps the list in
 * sight. Full width on small screens.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-border bg-surface shadow-hover"
        style={{ animation: "drawer-in 220ms cubic-bezier(0.24, 1, 0.4, 1)" }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="truncate text-h3 font-semibold text-text-primary">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-text-secondary">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="rounded-btn p-1 text-text-secondary hover:bg-surface-2"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <footer className="border-t border-border px-5 py-4 sm:px-6">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 max-h-[calc(100vh-2rem)] w-full ${width} overflow-y-auto rounded-modal border border-border bg-surface p-5 shadow-hover sm:p-6`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-btn p-1 text-text-secondary hover:bg-surface-2"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
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
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-6 text-sm text-text-secondary">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
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
 * Secondary actions tucked behind one "Plus" button, so a screen keeps a
 * single obvious main action. Closes on outside click and on Escape.
 */
export function MoreMenu({
  items,
  label = "Plus",
  placement = "down",
}: {
  items: MoreMenuItem[];
  label?: string;
  /** "up" for menus anchored at the bottom of a panel. */
  placement?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
        <span>{label}</span>
      </Button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-40 w-64 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-hover ${
            placement === "up" ? "bottom-full mb-2" : "mt-2"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                item.danger
                  ? "text-danger hover:bg-danger/10"
                  : "text-text-primary hover:bg-surface-2"
              }`}
            >
              {item.icon && <span className="mt-0.5 shrink-0">{item.icon}</span>}
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.hint && (
                  <span className="block text-xs text-text-secondary">{item.hint}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
      className={`flex w-full items-center rounded-btn border bg-surface text-sm focus-within:ring-2 focus-within:ring-primary/30 ${
        invalid ? "border-danger" : "border-border"
      }`}
    >
      <span className="select-none border-r border-border px-3 py-2 font-medium text-primary">
        {PHONE_PREFIX}
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        placeholder="22 123 456"
        value={formatPhoneLocal(value)}
        onChange={(e) => onChange(normalizePhone(e.target.value))}
        className="w-full bg-transparent px-3 py-2 tracking-wide text-text-primary placeholder:text-text-secondary/60 focus:outline-none"
      />
    </div>
  );
}
