import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import { Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader, Select, Toast, formatDateTime } from "@/components/ui";

interface AuditLogEntry {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  actor_email: string | null;
  actor_full_name: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  after_json: string | null;
  reason: string | null;
  created_at: number;
}

interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
}

const ENTITY_TYPES = [
  "auth", "user", "organization", "transaction", "invoice", "account", "product",
  "party", "team", "period_lock", "backup", "admin", "credit_note", "bank_reconciliation",
];

export function AuditLogsPage() {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    if (search) params.set("search", search);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return apiRequest<AuditLogResponse>(`/api/admin/audit-logs?${params.toString()}`);
  }, [entityType, action, search, offset]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat audit log");
    }
  }, [fetchLogs]);

  useEffect(() => {
    let cancelled = false;
    fetchLogs()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat audit log");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchLogs]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  const page = Math.floor(offset / limit) + 1;

  let tableBody: ReactNode;
  if (!data) {
    tableBody = <PageLoader />;
  } else if (data.entries.length === 0) {
    tableBody = <EmptyState title="Tidak ada entri" description="Ubah filter pencarian." />;
  } else {
    const rows = data.entries.map((entry) => (
      <tr key={entry.id}>
        <td data-label="Waktu" className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
          {formatDateTime(entry.created_at)}
        </td>
        <td data-label="Aktor" className="px-4 py-3">
          {entry.actor_email ?? (entry.entity_type === "admin" ? "Admin" : "Sistem")}
        </td>
        <td data-label="Organisasi" className="px-4 py-3 text-xs text-text-secondary">
          {entry.organization_name ?? (entry.organization_id ? entry.organization_id.slice(0, 8) : "—")}
        </td>
        <td data-label="Aksi" className="px-4 py-3">
          <Badge tone={entry.action.includes("delete") || entry.action.includes("disabled") ? "danger" : "info"}>
            {entry.action}
          </Badge>
        </td>
        <td data-label="Entitas" className="px-4 py-3 text-xs text-text-secondary">
          {entry.entity_type}
          <span className="ml-1 text-text-tertiary">({entry.entity_id.slice(0, 8)})</span>
        </td>
        <td data-label="Detail" className="max-w-[16rem] px-4 py-3">
          {entry.reason ?? parseAfter(entry.after_json)}
        </td>
      </tr>
    ));
    tableBody = (
      <>
        <div className="max-h-[70vh] overflow-auto md:overflow-x-auto">
          <table className="ledger-table w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Aktor</th>
                <th className="px-4 py-3">Organisasi</th>
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Entitas</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-sm">
          <span className="text-text-secondary">
            {data.total.toLocaleString("id-ID")} entri — halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              Sebelumnya
            </Button>
            <Button variant="secondary" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}>
              Berikutnya
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Audit Log Global" description="Seluruh aktivitas di semua organisasi, termasuk aksi admin." />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
          <Input
            placeholder="Cari entity ID atau alasan..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="max-w-xs"
          />
          <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setOffset(0); }} className="max-w-[11rem]">
            <option value="">Semua entitas</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input
            placeholder="Filter aksi (mis. user_disabled)"
            value={action}
            onChange={(e) => { setAction(e.target.value); setOffset(0); }}
            className="max-w-[14rem]"
          />
          <Button variant="secondary" className="ml-auto" onClick={() => void load()}>Muat ulang</Button>
        </div>

        {error ? <div className="px-4 pt-4"><Toast message={error} /></div> : null}

        {tableBody}
      </Card>
    </div>
  );
}

function parseAfter(afterJson: string | null): string {
  if (!afterJson) return "";
  try {
    const parsed = JSON.parse(afterJson) as Record<string, unknown>;
    const actor = parsed.actor as Record<string, unknown> | undefined;
    if (actor && typeof actor.email === "string") {
      return actor.email;
    }
    return "";
  } catch {
    return "";
  }
}