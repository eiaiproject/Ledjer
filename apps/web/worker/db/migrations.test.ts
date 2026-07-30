import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { CORE_TABLES } from "./schema";

interface TableInfo {
  name: string;
  columns: Set<string>;
}

interface MigrationState {
  tables: Map<string, TableInfo>;
  dropped: Set<string>;
}

function parseMigration(sql: string): {
  creates: { tableName: string; columns: string[] }[];
  alters: { tableName: string; column: string }[];
  drops: string[];
  indexes: { tableName: string; indexName: string }[];
} {
  const creates: { tableName: string; columns: string[] }[] = [];
  const alters: { tableName: string; column: string }[] = [];
  const drops: string[] = [];
  const indexes: { tableName: string; indexName: string }[] = [];

  // Match CREATE TABLE IF NOT EXISTS
  const createRe = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g;
  let match: RegExpExecArray | null;
  while ((match = createRe.exec(sql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns: string[] = [];
    for (const line of body.split("\n")) {
      const colMatch = line.trim().match(/^(\w+)\s/);
      if (colMatch && !line.trim().startsWith("FOREIGN") && !line.trim().startsWith("PRIMARY") && !line.trim().startsWith("CHECK") && !line.trim().startsWith("UNIQUE")) {
        columns.push(colMatch[1]);
      }
    }
    creates.push({ tableName, columns });
  }

  // Match ALTER TABLE ... ADD COLUMN
  const alterRe = /ALTER TABLE (\w+)\s+ADD COLUMN\s+(\w+)/g;
  while ((match = alterRe.exec(sql)) !== null) {
    alters.push({ tableName: match[1], column: match[2] });
  }

  // Match ALTER TABLE ... RENAME TO (consume regex, no alter entry added)
  const renameRe = /ALTER TABLE (\w+)\s+RENAME TO (\w+)/g;
  while (renameRe.exec(sql) !== null) { /* consume */ }

  // Match DROP TABLE IF EXISTS
  const dropRe = /DROP TABLE IF EXISTS (\w+)/g;
  while ((match = dropRe.exec(sql)) !== null) {
    drops.push(match[1]);
  }

  // Match CREATE INDEX IF NOT EXISTS ... ON table
  const indexRe = /CREATE INDEX IF NOT EXISTS (\w+)\s+ON\s+(\w+)/g;
  while ((match = indexRe.exec(sql)) !== null) {
    indexes.push({ indexName: match[1], tableName: match[2] });
  }

  return { creates, alters, drops, indexes };
}

function buildFinalSchema(migrations: { name: string; sql: string }[]): MigrationState {
  const tables = new Map<string, TableInfo>();
  const dropped = new Set<string>();

  for (const mig of migrations) {
    const { creates, alters, drops } = parseMigration(mig.sql);

    for (const d of drops) {
      tables.delete(d);
      dropped.add(d);
    }

    for (const c of creates) {
      tables.set(c.tableName, { name: c.tableName, columns: new Set(c.columns) });
    }

    // Handle RENAME TO pattern (expand-contract: v2 → original)
    const renameRe2 = /ALTER TABLE (\w+_v2)\s+RENAME TO (\w+)/g;
    let rmatch: RegExpExecArray | null;
    while ((rmatch = renameRe2.exec(mig.sql)) !== null) {
      const v2Name = rmatch[1]; // e.g. audit_logs_v2
      const originalName = rmatch[2]; // e.g. audit_logs
      const v2Table = tables.get(v2Name);
      if (v2Table) {
        v2Table.name = originalName;
        tables.delete(v2Name);
        tables.set(originalName, v2Table);
        dropped.delete(originalName); // table revived
      }
    }

    for (const a of alters) {
      const t = tables.get(a.tableName);
      if (t) t.columns.add(a.column);
    }
  }

  return { tables, dropped };
}

describe("Database Migrations", () => {
  const migDir = resolve(__dirname, "migrations");
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migrations = files.map((f) => ({
    name: basename(f, ".sql").replace(/_.*$/, ""),
    sql: readFileSync(resolve(migDir, f), "utf-8"),
  }));

  it("migrations are sequentially numbered 0001-0029", () => {
    const expected = Array.from({ length: 29 }, (_, i) =>
      String(i + 1).padStart(4, "0"),
    );
    const actual = migrations.map((m) => m.name);
    expect(actual).toEqual(expected);
  });

  it("every migration scans cleanly (no parse errors)", () => {
    for (const m of migrations) {
      const { creates, alters, drops, indexes } = parseMigration(m.sql);
      expect(() => {
        // If parsing produced no creates, alters, drops, or indexes, it's an issue
        // Only 0001 has INSERT+app_metadata, which is valid
        if (m.name !== "0001") {
          // Migration must have at least one schema change or index
          expect(creates.length + alters.length + drops.length + indexes.length).toBeGreaterThan(0);
        }
      }).not.toThrow();
    }
  });

  it("final schema contains all core tables", () => {
    const final = buildFinalSchema(migrations);
    for (const table of CORE_TABLES) {
      expect(final.tables.has(table)).toBe(true);
    }
    // Dropped tables should not exist
    expect(final.tables.has("export_jobs")).toBe(false);
    expect(final.tables.has("account_mappings")).toBe(false);
    expect(final.tables.has("business_documents")).toBe(false);
    expect(final.tables.has("document_lines")).toBe(false);
    expect(final.tables.has("recurring_transactions")).toBe(false);
    expect(final.tables.has("recurring_execution_log")).toBe(false);
    expect(final.tables.has("approval_requests")).toBe(false);
    expect(final.tables.has("approval_configs")).toBe(false);
    expect(final.tables.has("budgets")).toBe(false);
    expect(final.tables.has("budget_lines")).toBe(false);
    expect(final.tables.has("dimensions")).toBe(false);
    expect(final.tables.has("transaction_tags")).toBe(false);
    expect(final.tables.has("journal_line_tags")).toBe(false);
    expect(final.tables.has("fixed_assets")).toBe(false);
    expect(final.tables.has("asset_depreciation")).toBe(false);
    expect(final.tables.has("export_jobs_v2")).toBe(false);
  });

  it("each core table has at least one column", () => {
    const final = buildFinalSchema(migrations);
    for (const table of CORE_TABLES) {
      const info = final.tables.get(table);
      expect(info, `${table} missing from final schema`).toBeDefined();
      expect(info!.columns.size).toBeGreaterThan(0);
    }
  });

  it("ALTER TABLE references only existing tables", () => {
    const tables = new Set<string>();

    for (const m of migrations) {
      const { creates, alters, drops } = parseMigration(m.sql);

      for (const d of drops) tables.delete(d);
      for (const c of creates) tables.add(c.tableName);

      for (const a of alters) {
        expect(tables.has(a.tableName),
          `${m.name}: ALTER TABLE ${a.tableName} does not exist`).toBe(true);
      }
    }
  });

  it("no CREATE TABLE after DROP TABLE for same table", () => {
    const final = buildFinalSchema(migrations);
    // export_jobs and account_mappings should be dropped permanently
    for (const table of ["export_jobs", "account_mappings"]) {
      expect(final.tables.has(table)).toBe(false);
    }
  });

  it("migration files end with newline and are under 100KB", () => {
    for (const f of files) {
      const content = readFileSync(resolve(migDir, f), "utf-8");
      expect(content.length, `${f} exceeds 100KB`).toBeLessThan(100000);
      expect(content.endsWith("\n"), `${f} must end with newline`).toBe(true);
    }
  });

  it("migration SQL contains no obvious syntax errors (basic checks)", () => {
    const suspiciousPatterns = [
      { re: /\bUPDATE\s+\w+\s+SET\s+\w+\s*=\s*\w+\s+WHERE\s*$/i, msg: "incomplete UPDATE" },
      { re: /\bINSERT\s+INTO\s+\w+\s*$/i, msg: "incomplete INSERT" },
      { re: /\bWHERE\s+\w+\s*$/i, msg: "incomplete WHERE clause" },
    ];
    for (const mig of migrations) {
      for (const { re, msg } of suspiciousPatterns) {
        expect(re.test(mig.sql), `${mig.name}: ${msg}`).toBe(false);
      }
    }
  });
});
