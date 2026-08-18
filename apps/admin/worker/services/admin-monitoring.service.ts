import { queryAll, queryFirst } from "../db/client";

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
    mainAppHealth: await checkMainAppHealth(mainAppUrl),
  };
}

async function count(db: D1Database, table: string): Promise<number> {
  const row = await queryFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM "${table}"`);
  return row?.c ?? 0;
}

async function countWhere(db: D1Database, table: string, where: string): Promise<number> {
  const row = await queryFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM "${table}" WHERE ${where}`);
  return row?.c ?? 0;
}

async function checkMainAppHealth(mainAppUrl?: string): Promise<"up" | "down" | "unknown"> {
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
