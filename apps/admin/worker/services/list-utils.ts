import { queryFirst, type D1Input } from "../db/client";

/** Shared list-filter scaffolding for admin list endpoints. */
export interface AdminListFilters {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface PreparedList {
  where: string;
  limit: number;
  offset: number;
  values: D1Input[];
}

/** Build WHERE/LIMIT/OFFSET from filters + caller-supplied search SQL (2 `?` placeholders). */
export function prepareList(
  filters: AdminListFilters,
  searchSql: string,
  statusCol: string,
): PreparedList {
  const conditions: string[] = [];
  const values: D1Input[] = [];

  if (filters.search) {
    const search = `%${filters.search.toLowerCase()}%`;
    conditions.push(searchSql);
    values.push(search, search);
  }
  if (filters.status) {
    conditions.push(`${statusCol} = ?`);
    values.push(filters.status);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    limit: Math.min(Math.max(filters.limit ?? 50, 1), 200),
    offset: Math.max(filters.offset ?? 0, 0),
    values,
  };
}

/** COUNT(*) for a list query. */
export async function countRows(db: D1Database, from: string, where: string, values: D1Input[]): Promise<number> {
  const totalRow = await queryFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM ${from} ${where}`, values);
  return totalRow?.c ?? 0;
}