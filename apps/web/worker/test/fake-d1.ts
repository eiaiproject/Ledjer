type MaybePromise<T> = T | Promise<T>;

interface FakeD1Handlers {
  first?: (sql: string, values: unknown[]) => MaybePromise<unknown>;
  all?: (sql: string, values: unknown[]) => MaybePromise<unknown[]>;
  run?: (sql: string, values: unknown[]) => MaybePromise<D1Result | void>;
  batch?: (statements: { sql: string; values: unknown[] }[]) => MaybePromise<D1Result[]>;
}

// ponytail: Lightweight CHECK constraint validation for critical accounting invariants.
// Exported so seed-fixture handlers can call it too (they bypass .run via batch/run handlers).
export function validateJournalLine(sql: string, values: unknown[]): void {
  if (!sql.toLowerCase().includes("insert into journal_lines")) return;
  // VALUES have either 9 params (no party_id) or 10 params (with party_id)
  // [0:id, 1:orgId, 2:entryId, 3:acctId, ...]
  // If values has 10 items, index 4 = partyId, 5 = debit, 6 = credit
  // If values has 9 items, index 4 = debit, 5 = credit
  const debitIdx = values.length === 10 ? 5 : 4;
  const creditIdx = values.length === 10 ? 6 : 5;
  const debit = Number(values[debitIdx] ?? 0);
  const credit = Number(values[creditIdx] ?? 0);
  if (debit > 0 && credit > 0) {
    throw new Error("FakeD1: journal_line CHECK constraint violated: debit and credit both > 0");
  }
  if (debit === 0 && credit === 0) {
    throw new Error("FakeD1: journal_line CHECK constraint violated: debit and credit both zero");
  }
  if (debit < 0 || credit < 0) {
    throw new Error("FakeD1: journal_line CHECK constraint violated: negative values not allowed");
  }
}

export class FakeD1Statement {
  values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: await this.db.all<T>(this.sql, this.values) };
  }

  async run(): Promise<D1Result> {
    return this.db.run(this.sql, this.values);
  }
}

export class FakeD1Database {
  public statements: { sql: string; values: unknown[] }[] = [];

  constructor(private readonly handlers: FakeD1Handlers = {}) {}

  prepare(sql = ""): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  async first<T>(sql: string, values: unknown[]): Promise<T | null> {
    const row = await this.handlers.first?.(sql, values);
    return (row ?? null) as T | null;
  }

  async all<T>(sql: string, values: unknown[]): Promise<T[]> {
    const rows = await this.handlers.all?.(sql, values);
    return (rows ?? []) as T[];
  }

  async run(sql: string, values: unknown[]): Promise<D1Result> {
    this.statements.push({ sql, values });
    validateJournalLine(sql, values);
    return (await this.handlers.run?.(sql, values)) ?? { success: true, meta: { changes: 1 } } as D1Result;
  }

  async batch(statements: FakeD1Statement[]): Promise<D1Result[]> {
    if (this.handlers.batch) {
      return this.handlers.batch(statements.map((s) => ({ sql: s.sql, values: s.values })));
    }
    return Promise.all(statements.map((s) => s.run()));
  }
}
