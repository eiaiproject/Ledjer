import { queryAll } from "../db/client";

export interface PublicParty {
  id: string;
  name: string;
  party_type: "customer" | "supplier" | "employee" | "owner" | "other";
  is_active: boolean;
}

interface PartyRow {
  id: string;
  name: string;
  party_type: PublicParty["party_type"];
  is_active: 0 | 1;
}

export async function listParties(
  db: D1Database,
  organizationId: string,
): Promise<PublicParty[]> {
  const rows = await queryAll<PartyRow>(
    db,
    `SELECT id, name, party_type, is_active
     FROM parties
     WHERE organization_id = ?
       AND is_active = 1
     ORDER BY name`,
    [organizationId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    party_type: row.party_type,
    is_active: row.is_active === 1,
  }));
}
