export type D1Scalar = string | number | null | ArrayBuffer;
export type D1Input = D1Scalar | boolean | undefined;

export function nowMs(date = new Date()): number {
  return date.getTime();
}

export function normalizeD1Value(value: D1Input): D1Scalar {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value;
}

export function normalizeD1Values(values: readonly D1Input[]): D1Scalar[] {
  return values.map(normalizeD1Value);
}

export async function queryAll<T>(
  db: D1Database,
  sql: string,
  values: readonly D1Input[] = [],
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...normalizeD1Values(values)).all<T>();
  return result.results ?? [];
}

export async function queryFirst<T>(
  db: D1Database,
  sql: string,
  values: readonly D1Input[] = [],
): Promise<T | null> {
  const row = await db.prepare(sql).bind(...normalizeD1Values(values)).first<T>();
  return row ?? null;
}

export async function execute(
  db: D1Database,
  sql: string,
  values: readonly D1Input[] = [],
): Promise<D1Result> {
  return db.prepare(sql).bind(...normalizeD1Values(values)).run();
}

export function statement(
  db: D1Database,
  sql: string,
  values: readonly D1Input[] = [],
): D1PreparedStatement {
  return db.prepare(sql).bind(...normalizeD1Values(values));
}

export async function executeBatch(
  db: D1Database,
  statements: readonly D1PreparedStatement[],
): Promise<D1Result[]> {
  return db.batch([...statements]);
}
