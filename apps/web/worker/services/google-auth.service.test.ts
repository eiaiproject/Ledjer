import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { completeGoogleAuth, buildGoogleAuthUrl } from "./google-auth.service";
import { createSeedFixtures } from "../test/fixtures";
import { hashToken } from "../auth/tokens";
import { DEFAULT_ACCOUNTS } from "./ledger.service";
import { FIXTURE_IDS } from "../test/fixtures";

type TestDb = {
  first<T>(sql: string, values: unknown[]): Promise<T | null>;
  all<T>(sql: string, values: unknown[]): Promise<T[]>;
};

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  verified_email: boolean;
}

function mockGoogleFetch(user: GoogleUserInfo): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({ access_token: "fake-access-token", token_type: "Bearer", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("https://www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(JSON.stringify(user), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

const NEW_GOOGLE_USER: GoogleUserInfo = {
  id: "google-account-0001",
  email: "google-baru@test.com",
  name: "Andi Google",
  verified_email: true,
};

async function sessionRow(db: TestDb, token: string) {
  const tokenHash = await hashToken(token);
  return db.first<{ user_id: string }>(
    `SELECT s.user_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [tokenHash, Date.now()],
  );
}

async function businessNameForUser(db: TestDb, userId: string): Promise<string | null> {
  const row = await db.first<{ business_name: string }>(
    "SELECT business_name FROM users WHERE id = ?",
    [userId],
  );
  return row?.business_name ?? null;
}

describe("buildGoogleAuthUrl", () => {
  it("builds the authorization URL with state, scopes and redirect URI", () => {
    const url = buildGoogleAuthUrl("client-123", "https://app.test/api/auth/google/callback", "state-abc");
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://accounts.google.com");
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.test/api/auth/google/callback");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("scope")).toContain("email");
  });
});

describe("completeGoogleAuth", () => {
  beforeEach(() => {
    mockGoogleFetch(NEW_GOOGLE_USER);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates user + oauth link + default COA + session for a new Google user", async () => {
    const { db } = createSeedFixtures();
    const result = await completeGoogleAuth(
      db as unknown as D1Database,
      "auth-code-1",
      "client-123",
      "secret-123",
      "https://app.test/api/auth/google/callback",
      new Request("https://app.test"),
    );

    expect(result.token).toBeTruthy();

    const user = await (db as unknown as TestDb).first<{ id: string; full_name: string; business_name: string }>(
      "SELECT id, full_name, business_name FROM users WHERE email = ?",
      [NEW_GOOGLE_USER.email],
    );
    expect(user?.full_name).toBe("Andi Google");
    // Book name is derived from the Google profile and editable later.
    expect(user?.business_name).toBe("Bisnis Andi");

    // Google identity is linked
    const link = await (db as unknown as TestDb).first<{ user_id: string }>(
      "SELECT user_id FROM oauth_accounts WHERE provider = 'google' AND provider_account_id = ?",
      [NEW_GOOGLE_USER.id],
    );
    expect(link?.user_id).toBe(user?.id);

    // Default COA created (mirrors the email register flow)
    const accountRows = await (db as unknown as TestDb).all<{ code: string }>(
      "SELECT code FROM accounts WHERE user_id = ?",
      [user!.id],
    );
    expect(accountRows).toHaveLength(DEFAULT_ACCOUNTS.length);

    const session = await sessionRow(db as unknown as TestDb, result.token);
    expect(session?.user_id).toBe(user?.id);
  });

  it("auto-links an existing email user when Google verifies the email, keeping their book", async () => {
    const { db } = createSeedFixtures();
    const existingEmail = "owner@booka.test";

    mockGoogleFetch({
      id: "google-account-0002",
      email: existingEmail,
      name: "Owner A",
      verified_email: true,
    });

    await completeGoogleAuth(
      db as unknown as D1Database,
      "auth-code-2",
      "client-123",
      "secret-123",
      "https://app.test/api/auth/google/callback",
      new Request("https://app.test"),
    );

    const link = await (db as unknown as TestDb).first<{ user_id: string }>(
      "SELECT user_id FROM oauth_accounts WHERE provider = 'google' AND provider_account_id = ?",
      ["google-account-0002"],
    );
    expect(link?.user_id).toBe(FIXTURE_IDS.users.ownerA);

    // Existing book is untouched: linking never creates a second one or renames it
    expect(await businessNameForUser(db as unknown as TestDb, FIXTURE_IDS.users.ownerA)).toBe("PT Buku A");
  });

  it("logs in a returning Google user via the linked account", async () => {
    const { db } = createSeedFixtures();

    // First pass: auto-link (verified email)
    mockGoogleFetch({
      id: "google-account-0003",
      email: "owner@booka.test",
      name: "Owner A",
      verified_email: true,
    });
    await completeGoogleAuth(
      db as unknown as D1Database,
      "auth-code-3",
      "client-123",
      "secret-123",
      "https://app.test/api/auth/google/callback",
      new Request("https://app.test"),
    );

    // Second pass: same Google ID → found via oauth_accounts join
    const result = await completeGoogleAuth(
      db as unknown as D1Database,
      "auth-code-4",
      "client-123",
      "secret-123",
      "https://app.test/api/auth/google/callback",
      new Request("https://app.test"),
    );

    const session = await sessionRow(db as unknown as TestDb, result.token);
    expect(session?.user_id).toBe(FIXTURE_IDS.users.ownerA);
    expect(await businessNameForUser(db as unknown as TestDb, FIXTURE_IDS.users.ownerA)).toBe("PT Buku A");
  });

  it("rejects email auto-link when Google reports the email as unverified", async () => {
    const { db } = createSeedFixtures();
    mockGoogleFetch({
      id: "google-account-0004",
      email: "owner@booka.test",
      name: "Owner A",
      verified_email: false,
    });

    await expect(
      completeGoogleAuth(
        db as unknown as D1Database,
        "auth-code-5",
        "client-123",
        "secret-123",
        "https://app.test/api/auth/google/callback",
        new Request("https://app.test"),
      ),
    ).rejects.toMatchObject({ code: "oauth_email_conflict" });
  });
});