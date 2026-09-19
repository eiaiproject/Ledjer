import { USER_SCOPED_TABLES, type UserScopedTable } from "./schema";
import type { D1Input } from "./client";

/**
 * UserScopedRepository enforces user_id scoping on all queries against
 * user-scoped tables. Throws at query time if a user-scoped table is queried
 * without a user_id parameter.
 *
 * Ledjer is single-user (1 user = 1 buku), so user_id replaces the old
 * organization_id scoping.
 *
 * Usage:
 *   const repo = new UserScopedRepository(db);
 *   const rows = await repo.queryAll<AccountRow>(
 *     "SELECT * FROM accounts WHERE code = ? AND user_id = ?",
 *     ["1110", userId],
 *     { table: "accounts", userIndex: 1 },
 *   );
 *
 * The `userIndex` parameter specifies the index of the user_id value in the
 * bindings array (default 0).
 */
export interface UserScopeConfig {
  /** The user-scoped table being queried */
  table: string;
  /** Index of the user_id parameter in the values array (default 0) */
  userIndex?: number;
}

export class UserScopedRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Validates that the table is user-scoped and user_id is provided.
   * Throws if user_id is missing or invalid for a user-scoped table.
   */
  private assertScoped(
    sql: string,
    values: readonly unknown[],
    config: UserScopeConfig,
  ): void {
    if (!USER_SCOPED_TABLES.includes(config.table as UserScopedTable)) {
      return; // Non-user tables (users, sessions, etc.) need no row scoping
    }

    const idx = config.userIndex ?? 0;
    const userId = values[idx];

    if (!userId || typeof userId !== "string" || userId.length < 8) {
      throw new Error(
        `User-scoped query on '${config.table}' requires user_id ` +
        `at values[${idx}]. SQL: ${sql.substring(0, 120)}`,
      );
    }
  }

  async queryAll<T>(
    sql: string,
    values: readonly unknown[],
    config: UserScopeConfig,
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
    config: UserScopeConfig,
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
    config: UserScopeConfig,
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
      config: UserScopeConfig;
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
