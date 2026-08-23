/** Escape single quotes for SQLite string literal */
export function sqlEscape(str) {
  return String(str).replaceAll("'", "''");
}

/**
 * Build the admin upsert SQL. Escapes id, email, fullName, and hash.
 * `now` is numeric timestamp (ms).
 * Matches the schema used in scripts/create-admin.mjs:
 *   admin_users(id, email, password_hash, full_name, status, created_at, updated_at)
 */
export function buildAdminUpsertSql({ id, email, fullName, hash, now }) {
  const e = sqlEscape(email);
  const n = sqlEscape(fullName);
  const h = sqlEscape(hash);
  const i = sqlEscape(id);
  return `INSERT INTO admin_users (id, email, password_hash, full_name, status, created_at, updated_at)
VALUES ('${i}', '${e}', '${h}', '${n}', 'active', ${now}, ${now})
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  full_name = excluded.full_name,
  status = 'active',
  updated_at = excluded.updated_at;`;
}
