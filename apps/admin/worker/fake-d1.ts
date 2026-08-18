import { hashToken } from "./auth/tokens";
import { hashPassword } from "./auth/password";

interface Row {
  [key: string]: unknown;
}

/**
 * Minimal in-memory D1 for admin worker tests. Handles the handful of
 * queries the auth + users flows issue.
 */
export class FakeAdminD1 {
  public adminUsers: Row[] = [];
  public adminSessions: Row[] = [];
  public users: Row[] = [];
  public organizations: Row[] = [];
  public auditLogs: Row[] = [];
  public rateLimits: Row[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: { run(): Promise<D1Result> }[]): Promise<D1Result[]> {
    return Promise.all(statements.map((s) => s.run()));
  }
}

class FakeStatement {
  private bound: unknown[] = [];

  constructor(
    private readonly db: FakeAdminD1,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): this {
    this.bound = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const rows = this.executeQuery();
    return (rows[0] ?? null) as T | null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.executeQuery() as T[] };
  }

  async run(): Promise<D1Result> {
    if (this.sql.trimStart().toUpperCase().startsWith("SELECT")) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    this.executeMutation();
    return { success: true, meta: { changes: 1 } } as D1Result;
  }

  async batch(): Promise<D1Result[]> {
    return [{ success: true, meta: { changes: 1 } } as D1Result];
  }

  private tableName(): string | null {
    const match = /(?:FROM|INTO|UPDATE)\s+([a-z_]+)/i.exec(this.sql);
    return match ? match[1] : null;
  }

  private matchesWhere(row: Row): boolean {
    const whereMatch = /WHERE\s+([\s\S]*)$/i.exec(this.sql);
    if (!whereMatch) return true;
    const where = whereMatch[1];
    let idx = 0;
    const valueFor = (v: unknown): unknown => (typeof v === "boolean" ? (v ? 1 : 0) : v);

    // Parse simple `col = ?` AND `col = ?` clauses in order.
    const clauseRe = /([a-z_.]+)\s*(=|>=|<=|>|<|IS NOT NULL)\s*(\?|NULL)/gi;
    let m: RegExpExecArray | null;
    let ok = true;
    while ((m = clauseRe.exec(where)) && ok) {
      const [, colExpr, op, rhs] = m;
      // Strip table alias prefixes (e.g. `s.token_hash` -> `token_hash`);
      // fake rows store unprefixed keys.
      const col = colExpr.replace(/^\w+\./, "");
      if (op === "IS NOT NULL") {
        if (row[col] === null || row[col] === undefined) ok = false;
        continue;
      }
      if (rhs === "NULL") {
        if (row[col] !== null) ok = false;
        continue;
      }
      const expected = valueFor(this.bound[idx]);
      idx += 1;
      const actual = valueFor(row[col]);
      if (op === "=" && actual !== expected) ok = false;
      if (op === ">=" && !(Number(actual) >= Number(expected))) ok = false;
      if (op === "<=" && !(Number(actual) <= Number(expected))) ok = false;
      if (op === ">" && !(Number(actual) > Number(expected))) ok = false;
      if (op === "<" && !(Number(actual) < Number(expected))) ok = false;
    }
    return ok;
  }

  private executeQuery(): Row[] {
    // COUNT(*) aggregates -> a single { c: n } row.
    if (/COUNT\s*\(\s*\*\s*\)\s+AS\s+(c|cnt)/i.test(this.sql)) {
      const table = this.tableName();
      if (!table) return [];
      const rows = this.allRows(table).filter((r) => this.matchesWhere(r));
      return [{ c: rows.length }];
    }
    const table = this.tableName();
    if (!table) return [];
    const all = this.allRows(table);
    const rows = all.filter((r) => this.matchesWhere(r));
    // Model the JOIN admin_sessions -> admin_users: enrich session rows with
    // the admin's email / full_name / status columns the service reads back.
    if (table === "admin_sessions") {
      return rows.map((s) => {
        const admin = this.db.adminUsers.find((a) => a.id === s.admin_user_id);
        return admin ? { ...s, email: admin.email, full_name: admin.full_name, status: admin.status } : s;
      });
    }
    return rows;
  }

  private allRows(table: string): Row[] {
    switch (table) {
      case "admin_users": return this.db.adminUsers;
      case "admin_sessions": return this.db.adminSessions;
      case "users": return this.db.users;
      case "organizations": return this.db.organizations;
      case "audit_logs": return this.db.auditLogs;
      case "rate_limits": return this.db.rateLimits;
      default: return [];
    }
  }

  private executeMutation(): void {
    const table = this.tableName();
    if (!table) return;
    const sql = this.sql.trim();

    if (sql.toUpperCase().startsWith("INSERT INTO")) {
      this.allRows(table).push(this.rowFromInsert());
    } else if (sql.toUpperCase().startsWith("UPDATE")) {
      for (const row of this.allRows(table)) {
        if (this.matchesWhere(row)) {
          const sets = /SET\s+([\s\S]*?)(?:WHERE|$)/i.exec(sql)?.[1] ?? "";
          let idx = 0;
          for (const [, col] of sets.matchAll(/([a-z_]+)\s*=\s*\?/gi)) {
            row[col] = this.bound[idx];
            idx += 1;
          }
        }
      }
    }
  }

  private rowFromInsert(): Row {
    const cols = /\(([^)]+)\)\s*VALUES/.exec(this.sql)?.[1]
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean) ?? [];
    const row: Row = {};
    cols.forEach((col, i) => {
      row[col] = this.bound[i];
    });
    return row;
  }
}

export interface AdminEnv {
  DB: FakeAdminD1;
  APP_ORIGIN: string;
  APP_ENV: string;
  ADMIN_PASSWORD_PEPPER?: string;
}

export async function seedAdmin(db: FakeAdminD1, email = "admin@ledjer.id", password = "Admin12345") {
  const id = "admin-1";
  db.adminUsers.push({
    id,
    email,
    password_hash: await hashPassword(password),
    full_name: "Test Admin",
    status: "active",
    last_login_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  });
  return id;
}

export async function adminSessionToken(db: FakeAdminD1, adminId = "admin-1"): Promise<string> {
  const token = `session-token-${crypto.randomUUID()}`;
  const now = Date.now();
  db.adminSessions.push({
    id: "session-1",
    admin_user_id: adminId,
    token_hash: await hashToken(token),
    ip_address: null,
    user_agent: null,
    expires_at: now + 86_400_000,
    last_used_at: now,
    created_at: now,
  });
  return token;
}
