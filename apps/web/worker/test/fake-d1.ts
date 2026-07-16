type MaybePromise<T> = T | Promise<T>;

interface FakeD1Handlers {
  first?: (sql: string, values: unknown[]) => MaybePromise<unknown>;
  all?: (sql: string, values: unknown[]) => MaybePromise<unknown[]>;
  run?: (sql: string, values: unknown[]) => MaybePromise<D1Result | void>;
  batch?: (statements: { sql: string; values: unknown[] }[]) => MaybePromise<D1Result[]>;
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
    return (await this.handlers.run?.(sql, values)) ?? { success: true, meta: { changes: 1 } } as D1Result;
  }

  async batch(statements: FakeD1Statement[]): Promise<D1Result[]> {
    if (this.handlers.batch) {
      return this.handlers.batch(statements.map((s) => ({ sql: s.sql, values: s.values })));
    }
    return Promise.all(statements.map((s) => s.run()));
  }
}
