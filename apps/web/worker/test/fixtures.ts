import { FakeD1Database } from "./fake-d1";

export type Role = "owner" | "admin" | "member" | "viewer";

export interface OrgFixture {
  id: string;
  name: string;
  members: Record<Role, { id: string; user_id: string }>;
  accounts: { id: string; code: number; name: string }[];
}

export interface TestFixture {
  db: FakeD1Database;
  userA: { id: string; email: string };
  userB: { id: string; email: string };
  orgA: OrgFixture;
  orgB: OrgFixture;
}

let seq = 0;
const uid = () => `fixture-${++seq}`;

/**
 * Creates a seeded test fixture with two orgs.
 *
 * Usage:
 *   const fx = createTestFixture();
 *   // Query scoped to orgA:
 *   const rows = await db.prepare("SELECT * FROM accounts WHERE organization_id = ?").bind(fx.orgA.id).all();
 */
export function createTestFixture(): TestFixture {
  const db = new FakeD1Database();

  const userA = { id: uid(), email: "alice@test.ledjer.id" };
  const userB = { id: uid(), email: "bob@test.ledjer.id" };

  const makeOrg = (name: string): OrgFixture => {
    const id = uid();
    return {
      id,
      name,
      members: {
        owner: { id: uid(), user_id: userA.id },
        admin: { id: uid(), user_id: userB.id },
        member: { id: uid(), user_id: uid() },
        viewer: { id: uid(), user_id: uid() },
      },
      accounts: [
        { id: uid(), code: 1110, name: `${name} Cash` },
        { id: uid(), code: 4110, name: `${name} Revenue` },
      ],
    };
  };

  const orgA = makeOrg("Org A");
  const orgB = makeOrg("Org B");

  return { db, userA, userB, orgA, orgB };
}
