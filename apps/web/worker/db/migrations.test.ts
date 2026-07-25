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
} {
  const creates: { tableName: string; columns: string[] }[] = [];
  const alters: { tableName: string; column: string }[] = [];
  const drops: string[] = [];

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

  return { creates, alters, drops };
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

  it("migrations are sequentially numbered 0001-0016", () => {
    const expected = Array.from({ length: 16 }, (_, i) =>
      String(i + 1).padStart(4, "0"),
    );
    const actual = migrations.map((m) => m.name);
    expect(actual).toEqual(expected);
  });

  it("every migration scans cleanly (no parse errors)", () => {
    for (const m of migrations) {
      const { creates, alters, drops } = parseMigration(m.sql);
      expect(() => {
        // If parsing produced no creates, alters, or drops, it's an issue
        // Only 0001 has INSERT+app_metadata, which is valid
        if (m.name !== "0001") {
          // Migration must have at least one schema change
          expect(creates.length + alters.length + drops.length).toBeGreaterThan(0);
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
