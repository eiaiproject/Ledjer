import { describe, expect, it } from "vitest";
import { createSeedFixtures, ageFixtureSessionToken, expireFixtureSessionGrace } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";
import { getSessionByToken, revokeSessionToken } from "./session.service";

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

describe("session token rotation grace", () => {
  it("rotates an old token and still accepts the rotated-out token during the grace window", async () => {
    const { db, tokens } = createSeedFixtures();
    const d = db as unknown as D1Database;

    // Age the fixture session so the next lookup triggers rotation.
    await ageFixtureSessionToken(tokens.ownerA, EIGHT_DAYS_MS);

    const rotated = await getSessionByToken(d, tokens.ownerA);
    expect(rotated).not.toBeNull();
    expect(rotated!.newToken).toBeTruthy();

    // A parallel request still carrying the OLD cookie (the rotation winner
    // set the new cookie, but stragglers may arrive a moment later) must not
    // be logged out: the previous hash stays valid within the grace window.
    const straggler = await getSessionByToken(d, tokens.ownerA);
    expect(straggler).not.toBeNull();
    expect(straggler!.session_id).toBe(rotated!.session_id);
    expect(straggler!.newToken).toBeUndefined();

    // The new cookie works as the session's current token.
    const fresh = await getSessionByToken(d, rotated!.newToken!);
    expect(fresh).not.toBeNull();
    expect(fresh!.session_id).toBe(rotated!.session_id);
  });

  it("stops accepting the old token once the grace window expires", async () => {
    const { db, tokens } = createSeedFixtures();
    const d = db as unknown as D1Database;

    await ageFixtureSessionToken(tokens.ownerA, EIGHT_DAYS_MS);
    const rotated = await getSessionByToken(d, tokens.ownerA);
    expect(rotated!.newToken).toBeTruthy();

    // Old token still valid inside the window...
    expect(await getSessionByToken(d, tokens.ownerA)).not.toBeNull();

    // ...and rejected after the grace window passes.
    await expireFixtureSessionGrace(tokens.ownerA);
    expect(await getSessionByToken(d, tokens.ownerA)).toBeNull();

    // The rotated (current) token keeps working.
    expect(await getSessionByToken(d, rotated!.newToken!)).not.toBeNull();
  });

  it("rejects unknown tokens and revoked sessions including the previous hash", async () => {
    const { db, tokens } = createSeedFixtures();
    const d = db as unknown as D1Database;

    await ageFixtureSessionToken(tokens.ownerA, EIGHT_DAYS_MS);
    const rotated = await getSessionByToken(d, tokens.ownerA);
    expect(rotated!.newToken).toBeTruthy();

    await revokeSessionToken(d, rotated!.newToken!);
    expect(await getSessionByToken(d, rotated!.newToken!)).toBeNull();
    // Revocation kills the previous hash too (revoked_at guard).
    expect(await getSessionByToken(d, tokens.ownerA)).toBeNull();
    expect(await getSessionByToken(d, "definitely-not-a-real-token")).toBeNull();
  });
});
