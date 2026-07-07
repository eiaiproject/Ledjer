import { queryAll } from "../client";

interface SqliteObjectRow {
  name: string;
}

export async function listTables(db: D1Database): Promise<string[]> {
  const rows = await queryAll<SqliteObjectRow>(
    db,
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name != 'd1_migrations'
     ORDER BY name`,
  );

  return rows.map((row) => row.name);
}

export async function listIndexes(db: D1Database): Promise<string[]> {
  const rows = await queryAll<SqliteObjectRow>(
    db,
    `SELECT name
     FROM sqlite_master
     WHERE type = 'index'
       AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );

  return rows.map((row) => row.name);
}
