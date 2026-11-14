import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Info,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { auditApi, type AuditLogRow } from "@/lib/api/audit.api";
import { formatDateTime, roleLabel } from "@/lib/format";
import {
  Button,
  Card,
  Input,
  Select,
  Label,
  Badge,
  PageLoader,
  EmptyState,
} from "@/components/ui";
import type { UserRole } from "@fuego/shared";

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", { actionFilter, entityTypeFilter, page }],
    queryFn: () =>
      auditApi.list({
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
        page,
        limit: 20,
      }),
  });

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getActionTone = (action: string): "neutral" | "success" | "danger" | "warning" | "info" | "primary" => {
    if (action.includes("created") || action.includes("confirmed")) return "success";
    if (action.includes("deleted") || action.includes("cancelled")) return "danger";
    if (action.includes("updated") || action.includes("edited")) return "warning";
    if (action.includes("login") || action.includes("delivered")) return "primary";
    return "neutral";
  };

  return (
    <DashboardShell
      title="Journal d'audit"
      subtitle="Registre immuable de traçabilité des actions et des flux opérationnels"
    >
      <div className="space-y-4">
        {/* Filter bar */}
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Type d'entité</Label>
              <Select
                value={entityTypeFilter}
                onChange={(e) => {
                  setEntityTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Toutes les entités</option>
                <option value="order">Commande (order)</option>
                <option value="payment">Paiement (payment)</option>
                <option value="expense">Dépense (expense)</option>
                <option value="user">Utilisateur (user)</option>
                <option value="settings">Paramètres (settings)</option>
                <option value="database">Base de données (database)</option>
              </Select>
            </div>

            <div>
              <Label>Action spécifique</Label>
              <Input
                placeholder="Ex: order.confirmed, expense.created..."
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="flex flex-col justify-end">
              <p className="text-xs text-text-secondary">
                {data ? `${data.meta.total} entrée(s) trouvée(s)` : "Chargement..."}
              </p>
            </div>
          </div>
        </Card>

        {/* Audit Table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <PageLoader />
          ) : !data || data.data.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-10 w-10" />}
              title="Aucun événement d'audit"
              description="Aucune trace correspondant à ces critères n'a été trouvée."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">Date & Heure</th>
                    <th className="px-4 py-3">Utilisateur</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Entité</th>
                    <th className="px-4 py-3">Détail</th>
                    <th className="px-4 py-3 text-center">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.data.map((row) => {
                    const isExpanded = expandedId === row.id;
                    return (
                      <tr
                        key={row.id}
                        className="group hover:bg-surface-2/40 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-text-primary">
                            {row.actor_label || "Système"}
                          </div>
                          {row.actor_role && (
                            <div className="text-[11px] text-text-secondary">
                              {roleLabel[row.actor_role as UserRole] || row.actor_role}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={getActionTone(row.action)}>
                            {row.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs uppercase text-text-secondary">
                            {row.entity_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-primary">
                          {row.entity_label || row.entity_id || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => toggleExpand(row.id)}
                            title={isExpanded ? "Masquer" : "Afficher le contenu"}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Expanded Drawer / Detail modal when clicked */}
          {expandedId && (
            <div className="border-t border-border bg-surface-2/70 p-4">
              {(() => {
                const target = data?.data.find((r) => r.id === expandedId);
                if (!target) return null;

                let parsedMeta = null;
                let parsedPrev = null;
                let parsedNew = null;
                try { if (target.meta) parsedMeta = JSON.parse(target.meta); } catch {}
                try { if (target.prev_values) parsedPrev = JSON.parse(target.prev_values); } catch {}
                try { if (target.new_values) parsedNew = JSON.parse(target.new_values); } catch {}

                return (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text-primary">
                        Détails techniques de l'événement #{target.id.slice(0, 8)}
                      </span>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="text-text-secondary hover:text-text-primary"
                      >
                        Fermer ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <span className="font-semibold text-text-secondary">Adresse IP : </span>
                        <span>{target.ip_address || "Locale / Interne"}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-text-secondary">ID Entité : </span>
                        <span className="font-mono">{target.entity_id || "N/A"}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-text-secondary">Horodatage ISO : </span>
                        <span>{target.created_at}</span>
                      </div>
                    </div>

                    {parsedMeta && (
                      <div>
                        <span className="font-semibold text-text-secondary">Métadonnées :</span>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[11px] text-text-primary border border-border">
                          {JSON.stringify(parsedMeta, null, 2)}
                        </pre>
                      </div>
                    )}

                    {parsedPrev && (
                      <div>
                        <span className="font-semibold text-text-secondary">Valeurs antérieures :</span>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[11px] text-text-primary border border-border">
                          {JSON.stringify(parsedPrev, null, 2)}
                        </pre>
                      </div>
                    )}

                    {parsedNew && (
                      <div>
                        <span className="font-semibold text-text-secondary">Nouvelles valeurs :</span>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[11px] text-text-primary border border-border">
                          {JSON.stringify(parsedNew, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Pagination */}
          {data && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
              <span>
                Page {data.meta.page} sur {data.meta.totalPages} ({data.meta.total} entrées)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  disabled={data.meta.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  disabled={data.meta.page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
