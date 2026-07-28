import { TENANT_SCOPED_TABLES, type TenantScopedTable } from "./schema";
import type { D1Input } from "./client";

/**
 * TenantScopedRepository enforces organization_id scoping on all queries
 * against tenant-scoped tables. Throws at query time if a tenant-scoped
 * table is queried without an organization_id parameter.
 *
 * Usage:
 *   const repo = new TenantScopedRepository(db);
 *   const rows = await repo.queryAll<AccountRow>(
 *     "SELECT * FROM accounts WHERE code = ?",
 *     [orgId, "1110"],
 *     { table: "accounts", orgIndex: 0 }
 *   );
 *
 * The `orgIndex` parameter specifies the index of the organization_id
 * value in the bindings array (default 0).
 *
 * ARCHITECTURE NOTE: TenantScopedRepository is opt-in.
 * All service functions MUST use organization_id in WHERE clauses.
 * CI script check-org-scoping.sh enforces this via grep.
 * Future: Consider making TenantScopedRepository mandatory via
 * a lint rule or DI container that injects org-scoped queries.
 */
export interface TenantScopeConfig {
  /** The tenant-scoped table being queried */
  table: string;
  /** Index of the organization_id parameter in the values array (default 0) */
  orgIndex?: number;
}

export class TenantScopedRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Validates that the table is tenant-scoped and organization_id is provided.
   * Throws if organization_id is missing or invalid for a tenant-scoped table.
   */
  private assertScoped(
    sql: string,
    values: readonly unknown[],
    config: TenantScopeConfig,
  ): void {
    if (!TENANT_SCOPED_TABLES.includes(config.table as TenantScopedTable)) {
      return; // Non-tenant tables (users, sessions, etc.) don't need org scoping
    }

    const idx = config.orgIndex ?? 0;
    const orgId = values[idx];

    if (!orgId || typeof orgId !== "string" || orgId.length < 8) {
      throw new Error(
        `Tenant-scoped query on '${config.table}' requires organization_id ` +
        `at values[${idx}]. SQL: ${sql.substring(0, 120)}`,
      );
    }
  }

  async queryAll<T>(
    sql: string,
    values: readonly unknown[],
    config: TenantScopeConfig,
  ): Promise<T[]> {
    this.assertScoped(sql, values, config);
    const result = await this.db
      .prepare(sql)
      .bind(...(values as D1Input[]))
      .all<T>();
    return result.results ?? [];
  }

  async queryFirst<T>(
    sql: string,
    values: readonly unknown[],
    config: TenantScopeConfig,
  ): Promise<T | null> {
    this.assertScoped(sql, values, config);
    return this.db
      .prepare(sql)
      .bind(...(values as D1Input[]))
      .first<T | null>();
  }

  async execute(
    sql: string,
    values: readonly unknown[],
    config: TenantScopeConfig,
  ): Promise<D1Result> {
    this.assertScoped(sql, values, config);
    return this.db
      .prepare(sql)
      .bind(...(values as D1Input[]))
      .run();
  }

  batch(
    statements: Array<{
      sql: string;
      values: readonly unknown[];
      config: TenantScopeConfig;
    }>,
  ): Promise<D1Result[]> {
    for (const stmt of statements) {
      this.assertScoped(stmt.sql, stmt.values, stmt.config);
    }
    return this.db.batch(
      statements.map((s) => this.db.prepare(s.sql).bind(...(s.values as D1Input[]))),
    );
  }
}
