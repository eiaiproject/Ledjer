import { queryAll, queryFirst } from "../db/client";
import { badRequest } from "../http/errors";

export interface PlatformSummary {
  counts: {
    users: number;
    active_users: number;
    organizations: number;
    active_organizations: number;
    transactions: number;
    journal_entries: number;
    products: number;
    admins: number;
    active_admins: number;
  };
  registrationsLast7Days: { date: string; count: number }[];
  mainAppHealth: "up" | "down" | "unknown";
}

export async function getPlatformSummary(
  db: D1Database,
  mainAppUrl?: string,
  mainApp?: Fetcher,
): Promise<PlatformSummary> {
  const counts = {
    users: await count(db, "users"),
    active_users: await countWhere(db, "users", "status = 'active'"),
    organizations: await count(db, "organizations"),
    active_organizations: await countWhere(db, "organizations", "status = 'active'"),
    transactions: await count(db, "transactions"),
    journal_entries: await count(db, "journal_entries"),
    products: await count(db, "products"),
    admins: await count(db, "admin_users"),
    active_admins: await countWhere(db, "admin_users", "status = 'active'"),
  };

  // Registrations per day for the last 7 days (WIB).
  const since = Date.now() - 7 * 86_400_000;
  const registrations = await queryAll<{ day: string; count: number }>(
    db,
    `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+7 hours') AS day,
            COUNT(*) AS count
     FROM users
     WHERE created_at >= ?
     GROUP BY day
     ORDER BY day ASC`,
    [since],
  );

  return {
    counts,
    registrationsLast7Days: registrations.map((r) => ({ date: r.day, count: r.count })),
    mainAppHealth: await checkMainAppHealth(mainAppUrl, mainApp),
  };
}

const ID_ENTITY_QUERIES: Record<
  string,
  { table: string; select: string; label: (row: Record<string, unknown>) => string | null }
> = {
  users: { table: "users", select: "id, email", label: (r) => (typeof r.email === "string" ? r.email : null) },
  organizations: { table: "organizations", select: "id, name", label: (r) => (typeof r.name === "string" ? r.name : null) },
  transactions: { table: "transactions", select: "id, transaction_number", label: (r) => (typeof r.transaction_number === "string" ? r.transaction_number : null) },
  journal_entries: { table: "journal_entries", select: "id, entry_number", label: (r) => (typeof r.entry_number === "string" ? r.entry_number : null) },
  products: { table: "products", select: "id, code, name", label: (r) => (typeof r.code === "string" && typeof r.name === "string" ? `${r.code} · ${r.name}` : null) },
  admin_users: { table: "admin_users", select: "id, email", label: (r) => (typeof r.email === "string" ? r.email : null) },
};

export interface EntityIdRow {
  id: string;
  label: string | null;
}

/** Recent entity IDs + display label, newest first (for dashboard drill-down). */
export async function getEntityIds(db: D1Database, entity: string, limit = 50): Promise<EntityIdRow[]> {
  const query = ID_ENTITY_QUERIES[entity];
  if (!query) {
    throw badRequest(
      "invalid_entity",
      `Unknown entity \`${entity}\`; expected one of: ${Object.keys(ID_ENTITY_QUERIES).join(", ")}`,
    );
  }
  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT ${query.select} FROM ${query.table} ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: typeof row.id === "string" ? row.id : "",
    label: query.label(row),
  }));
}

async function count(db: D1Database, table: string): Promise<number> {
  const row = await queryFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM "${table}"`);
  return row?.c ?? 0;
}

async function countWhere(db: D1Database, table: string, where: string): Promise<number> {
  const row = await queryFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM "${table}" WHERE ${where}`);
  return row?.c ?? 0;
}

async function checkMainAppHealth(
  mainAppUrl?: string,
  mainApp?: Fetcher,
): Promise<"up" | "down" | "unknown"> {
  // Prefer the service binding — it dispatches the call directly inside the
  // Workers runtime, which is the only reliable way to call the main app
  // (Worker→Worker via public *.workers.dev hostname fails with CF 1042).
  if (mainApp) {
    try {
      const res = await mainApp.fetch("https://main-app/api/health", { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return "down";
      const body = (await res.json()) as { status?: string };
      return body.status === "healthy" ? "up" : "down";
    } catch {
      return "down";
    }
  }
  // Fallback to public-URL fetch (used only if the service binding is missing,
  // which would only happen in local dev or misconfiguration).
  if (!mainAppUrl) return "unknown";
  try {
    const res = await fetch(`${mainAppUrl}/api/health`, {
      headers: { "User-Agent": "ledjer-admin" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return "down";
    const body = (await res.json()) as { status?: string };
    return body.status === "healthy" ? "up" : "down";
  } catch {
    return "down";
  }
}
