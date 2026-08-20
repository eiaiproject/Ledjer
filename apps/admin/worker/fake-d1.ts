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
    const whereIdx = this.sql.toUpperCase().lastIndexOf(" WHERE ");
    if (whereIdx === -1) return true;
    const where = this.sql.slice(whereIdx + 7);
    const clauses: string[] = [];
    let rest = where;
    for (;;) {
      const andIdx = rest.toUpperCase().indexOf(" AND ");
      if (andIdx === -1) {
        clauses.push(rest);
        break;
      }
      clauses.push(rest.slice(0, andIdx));
      rest = rest.slice(andIdx + 5);
    }
    let idx = 0;
    for (const clauseRaw of clauses) {
      const m = /^([a-z_.]+)\s*(=|>=|<=|>|<|IS NOT NULL)\s*(\?|NULL)$/i.exec(clauseRaw.trim());
      if (!m) continue;
      const col = m[1].replace(/^\w+\./, "");
      if (!this.matchesClause(row, col, m[2], m[3], idx)) return false;
      if (m[3] === "?") idx += 1;
    }
    return true;
  }

  private matchesClause(row: Row, col: string, op: string, rhs: string, idx: number): boolean {
    const normalize = (v: unknown): unknown => (typeof v === "boolean" ? Number(v) : v);
    const actual = normalize(row[col]);
    if (op === "IS NOT NULL") return actual !== null && actual !== undefined;
    if (rhs === "NULL") return actual === null;
    const expected = normalize(this.bound[idx]);
    if (op === "=") return actual === expected;
    if (op === ">=") return Number(actual) >= Number(expected);
    if (op === "<=") return Number(actual) <= Number(expected);
    if (op === ">") return Number(actual) > Number(expected);
    return Number(actual) < Number(expected);
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
      const setIdx = sql.toUpperCase().indexOf(" SET ");
      const whereIdx = sql.toUpperCase().lastIndexOf(" WHERE");
      const sets = sql.slice(setIdx + 5, whereIdx === -1 ? sql.length : whereIdx);
      for (const row of this.allRows(table)) {
        if (!this.matchesWhere(row)) continue;
        this.applySets(row, sets);
      }
    }
  }

  private applySets(row: Row, sets: string): void {
    let idx = 0;
    for (const part of sets.split(",")) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1 || !trimmed.endsWith("?")) continue;
      const col = trimmed.slice(0, eqIdx).trim();
      if (!col) continue;
      row[col] = this.bound[idx];
      idx += 1;
    }
  }

  private rowFromInsert(): Row {
    const openIdx = this.sql.indexOf("(");
    const closeIdx = this.sql.indexOf(")");
    const cols = (openIdx === -1 || closeIdx === -1 ? "" : this.sql.slice(openIdx + 1, closeIdx))
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
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
