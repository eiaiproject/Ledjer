import { DatabaseSync } from "node:sqlite";

/**
 * Minimal real-SQLite stand-in for D1Database: the service layer only uses
 * prepare().bind().all()/first()/run(), so a thin adapter over node:sqlite
 * gives real SQL semantics without a D1 emulator.
 */
export class SqliteD1 {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.db, sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }
}

export class SqliteD1Statement {
  private values: (string | number | null)[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: (string | number | null)[]): this {
    this.values = values;
    return this;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const result = this.db.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}
