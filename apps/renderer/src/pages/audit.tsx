import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Search } from "lucide-react";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { auditApi, type AuditLogRow } from "@/lib/api/audit.api";
import { formatDateTime, roleLabel } from "@/lib/format";
import { Badge, Button, Drawer, EmptyState, ErrorState, TableSkeleton } from "@/components/ui";
import type { UserRole } from "@fuego/shared";

type Row = AuditLogRow & Record<string, unknown>;
type Tone = "neutral" | "success" | "danger" | "warning" | "info" | "primary";

const PAGE_SIZE = 20;

const ENTITY_OPTIONS = [
  { value: "order", label: "Commande (order)" },
  { value: "payment", label: "Paiement (payment)" },
  { value: "expense", label: "Dépense (expense)" },
  { value: "user", label: "Utilisateur (user)" },
  { value: "settings", label: "Paramètres (settings)" },
  { value: "database", label: "Base de données (database)" },
];

function getActionTone(action: string): Tone {
  if (action.includes("created") || action.includes("confirmed")) return "success";
  if (action.includes("deleted") || action.includes("cancelled")) return "danger";
  if (action.includes("updated") || action.includes("edited")) return "warning";
  if (action.includes("login") || action.includes("delivered")) return "primary";
  return "neutral";
}

function actorRole(row: AuditLogRow): string | null {
  if (!row.actor_role) return null;
  return roleLabel[row.actor_role as UserRole] || row.actor_role;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  // The row stays set while the drawer animates out.
  const [detail, setDetail] = useState<AuditLogRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = (row: AuditLogRow) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit", { actionFilter, entityTypeFilter, page }],
    queryFn: () =>
      auditApi.list({
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });

  const rows = (data?.data ?? []) as Row[];
  const filtered = actionFilter !== "" || entityTypeFilter !== "";
  const clearFilters = () => {
    setActionFilter("");
    setEntityTypeFilter("");
    setPage(1);
  };

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: "created_at",
        header: "Date et heure",
        width: pixel(170),
        renderCell: (r) => (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {formatDateTime(r.created_at)}
          </Text>
        ),
      },
      {
        key: "actor_label",
        header: "Utilisateur",
        width: proportional(1),
        renderCell: (r) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-text-primary">{r.actor_label || "Système"}</span>
            {actorRole(r) && (
              <Text type="supporting" color="secondary">
                {actorRole(r)}
              </Text>
            )}
          </div>
        ),
      },
      {
        key: "action",
        header: "Action",
        width: proportional(1),
        renderCell: (r) => <Badge tone={getActionTone(r.action)}>{r.action}</Badge>,
      },
      {
        key: "entity_type",
        header: "Entité",
        width: pixel(120),
        renderCell: (r) => (
          <span className="font-mono text-xs uppercase text-text-secondary">{r.entity_type}</span>
        ),
      },
      {
        key: "entity_label",
        header: "Détail",
        width: proportional(1),
        renderCell: (r) => (
          <Text maxLines={2}>{r.entity_label || r.entity_id || "—"}</Text>
        ),
      },
      {
        key: "details",
        header: "",
        width: pixel(110),
        align: "end",
        renderCell: (r) => (
          <AxButton label="Détails" size="sm" variant="ghost" onClick={() => openDetail(r)} />
        ),
      },
    ],
    [],
  );

  return (
    <DashboardShell
      title="Journal d'audit"
      subtitle="Registre immuable de traçabilité des actions et des flux opérationnels"
    >
      <div className="flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 sm:w-[240px] sm:flex-none">
            <Selector
              label="Type d'entité"
              isLabelHidden
              placeholder="Toutes les entités"
              options={ENTITY_OPTIONS}
              value={entityTypeFilter || null}
              onChange={(v) => {
                setEntityTypeFilter(v ?? "");
                setPage(1);
              }}
              hasClear
              width="100%"
            />
          </div>
          <div className="min-w-0 flex-1 sm:w-[300px] sm:flex-none">
            <TextInput
              label="Action spécifique"
              isLabelHidden
              type="search"
              placeholder="Action, ex. order.confirmed"
              startIcon={<Icon icon={Search} size="sm" />}
              value={actionFilter}
              onChange={(v) => {
                setActionFilter(v);
                setPage(1);
              }}
              hasClear
              width="100%"
            />
          </div>
          <Text type="supporting" color="secondary">
            {data ? `${data.meta.total} entrée(s) trouvée(s)` : "Chargement…"}
          </Text>
        </div>

        <Card padding={0}>
          {isLoading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-10 w-10" />}
              title="Aucun événement d'audit"
              description="Aucune trace correspondant à ces critères n'a été trouvée."
              action={
                filtered ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Effacer les filtres
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Table from md; a tappable list on phones. */}
              <div className="hidden md:block">
                <Table<Row>
                  data={rows}
                  columns={columns}
                  idKey="id"
                  hasHover
                  verticalAlign="middle"
                />
              </div>
              <ul className="divide-y divide-border md:hidden">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => openDetail(r)}
                      className="flex w-full flex-col gap-1.5 px-4 py-3 text-left"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <Badge tone={getActionTone(r.action)}>{r.action}</Badge>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {formatDateTime(r.created_at)}
                        </Text>
                      </span>
                      <span className="min-w-0 truncate text-sm text-text-primary">
                        {r.entity_label || r.entity_id || "—"}
                      </span>
                      <Text type="supporting" color="secondary">
                        {r.actor_label || "Système"}
                        {actorRole(r) ? ` · ${actorRole(r)}` : ""}
                      </Text>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {data && data.meta.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text type="supporting" color="secondary">
              Page {data.meta.page} sur {data.meta.totalPages} ({data.meta.total} entrées)
            </Text>
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              totalItems={data.meta.total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
              size="sm"
            />
          </div>
        )}
      </div>

      <AuditDetailDrawer row={detail} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </DashboardShell>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex flex-col gap-1">
      <Text type="label">{label}</Text>
      <pre className="max-h-60 overflow-auto rounded border border-border bg-surface-2 p-2 font-mono text-[11px] text-text-primary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** Technical detail of one event, in a side panel so the list stays visible. */
function AuditDetailDrawer({
  row,
  open,
  onClose,
}: {
  row: AuditLogRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open && !!row}
      onClose={onClose}
      title={row ? `Événement #${row.id.slice(0, 8)}` : "Événement"}
      subtitle={row ? formatDateTime(row.created_at) : undefined}
    >
      {row && (
        <div className="flex flex-col gap-5">
          <MetadataList>
            <MetadataListItem label="Action">
              <Badge tone={getActionTone(row.action)}>{row.action}</Badge>
            </MetadataListItem>
            <MetadataListItem label="Utilisateur">
              {row.actor_label || "Système"}
              {actorRole(row) ? ` · ${actorRole(row)}` : ""}
            </MetadataListItem>
            <MetadataListItem label="Entité">
              <span className="font-mono text-xs uppercase">{row.entity_type}</span>
            </MetadataListItem>
            <MetadataListItem label="Détail">{row.entity_label || "—"}</MetadataListItem>
            <MetadataListItem label="ID entité">
              <span className="break-all font-mono text-xs">{row.entity_id || "N/A"}</span>
            </MetadataListItem>
            <MetadataListItem label="Adresse IP">{row.ip_address || "Locale / Interne"}</MetadataListItem>
            <MetadataListItem label="Horodatage ISO">
              <span className="font-mono text-xs">{row.created_at}</span>
            </MetadataListItem>
          </MetadataList>
          <JsonBlock label="Métadonnées" value={parseJson(row.meta)} />
          <JsonBlock label="Valeurs antérieures" value={parseJson(row.prev_values)} />
          <JsonBlock label="Nouvelles valeurs" value={parseJson(row.new_values)} />
        </div>
      )}
    </Drawer>
  );
}
