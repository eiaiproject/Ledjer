/**
 * Parties repository — read/write parties (customers/suppliers) from local SQLite.
 */

import type { Database } from "@sqlite.org/sqlite-wasm";
import { appendOutbox } from "./outbox.repo";

export interface Party {
  id: string;
  user_id: string;
  name: string;
  party_type: "customer" | "supplier" | "both";
  contact: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

/** Map a raw row array to a Party object. */
function rowToParty(row: unknown[]): Party {
  return {
    id: String(row[0]),
    user_id: String(row[1]),
    name: String(row[2]),
    party_type: String(row[3]) as Party["party_type"],
    contact: row[4] as string | null,
    is_active: Number(row[5]),
    created_at: Number(row[6]),
    updated_at: Number(row[7]),
  };
}

// ── Read ─────────────────────────────────────────────────────────

/** Fetch all parties for a user. */
export function getAllParties(db: Database, userId: string): Party[] {
  const stmt = db.prepare(
    `SELECT id, user_id, name, party_type, contact, is_active, created_at, updated_at
     FROM parties WHERE user_id = ? ORDER BY name`,
  );
  stmt.bind([userId]);
  const results: Party[] = [];
  while (stmt.step()) {
    results.push(rowToParty(stmt.get([])));
  }
  stmt.finalize();
  return results;
}

/** Find a single party by ID. */
export function getPartyById(db: Database, partyId: string): Party | null {
  const stmt = db.prepare(
    `SELECT id, user_id, name, party_type, contact, is_active, created_at, updated_at
     FROM parties WHERE id = ?`,
  );
  stmt.bind([partyId]);
  let result: Party | null = null;
  if (stmt.step()) {
    result = rowToParty(stmt.get([]));
  }
  stmt.finalize();
  return result;
}

// ── Write ─────────────────────────────────────────────────────────

/** Create a new party in local DB + outbox. */
export function createPartyLocal(
  db: Database,
  userId: string,
  input: { name: string; partyType?: Party["party_type"]; contact?: string },
): Party {
  const id = crypto.randomUUID();
  const now = Date.now();

  db.exec({
    sql: `INSERT INTO parties (id, user_id, name, party_type, contact, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    bind: [id, userId, input.name, input.partyType ?? "both", input.contact ?? null, now, now],
  });

  appendOutbox(db, userId, "party", id, "create", {
    name: input.name,
    partyType: input.partyType ?? "both",
    contact: input.contact ?? null,
  });

  return getPartyById(db, id)!;
}
