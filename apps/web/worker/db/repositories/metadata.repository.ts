import { execute, queryFirst, type D1Input } from "../client";

interface MetadataRow {
  key: string;
  value: string;
  updated_at: number;
}

export async function getMetadata(
  db: D1Database,
  key: string,
): Promise<MetadataRow | null> {
  return queryFirst<MetadataRow>(
    db,
    "SELECT key, value, updated_at FROM app_metadata WHERE key = ?",
    [key],
  );
}

export async function setMetadata(
  db: D1Database,
  key: string,
  value: string,
  updatedAt: number,
): Promise<void> {
  const values: D1Input[] = [key, value, updatedAt];

  await execute(
    db,
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    values,
  );
}
