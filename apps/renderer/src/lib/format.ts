import type { UserRole } from "@fuego/shared";

/** Money: stored as integer millimes (1 DT = 1000) — displayed "12,500 DT". */
export function formatMillimes(millimes: number): string {
  const dt = millimes / 1000;
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(dt);
  return `${formatted} DT`;
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export const roleLabel: Record<UserRole, string> = {
  super_admin: "Administrateur",
  staff: "Employé",
};
