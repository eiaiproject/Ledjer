import { describe, expect, it } from "vitest";
import { app } from "./index";
import { FakeAdminD1, seedAdmin, adminSessionToken, type AdminEnv } from "./fake-d1";

function env(db: FakeAdminD1, overrides: Partial<AdminEnv> = {}): AdminEnv {
  return {
    DB: db,
    APP_ORIGIN: "http://localhost:5173",
    APP_ENV: "development",
    ...overrides,
  };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

describe("Admin auth", () => {
  it("logs in with valid credentials and sets a session cookie", async () => {
    const db = new FakeAdminD1();
    await seedAdmin(db);

    const response = await app.fetch(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email: "admin@ledjer.id", password: "Admin12345" }),
      }),
      env(db) as unknown as AdminEnv & { ASSETS: Fetcher; BACKUP_BUCKET?: R2Bucket },
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("ledjer_admin_session=");
  });

  it("rejects invalid credentials", async () => {
    const db = new FakeAdminD1();
    await seedAdmin(db);

    const response = await app.fetch(
      new Request("http://localhost/api/admin/auth/login", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email: "admin@ledjer.id", password: "WrongPass1" }),
      }),
      env(db) as unknown as AdminEnv & { ASSETS: Fetcher; BACKUP_BUCKET?: R2Bucket },
    );

    expect(response.status).toBe(401);
  });

  it("returns admin:null for /me when logged out", async () => {
    const db = new FakeAdminD1();
    const response = await app.fetch(
      new Request("http://localhost/api/admin/auth/me"),
      env(db) as unknown as AdminEnv & { ASSETS: Fetcher; BACKUP_BUCKET?: R2Bucket },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ admin: null });
  });

  it("returns the admin for /me when a valid session cookie is present", async () => {
    const db = new FakeAdminD1();
    await seedAdmin(db);
    const token = await adminSessionToken(db);

    const response = await app.fetch(
      new Request("http://localhost/api/admin/auth/me", {
        headers: { Cookie: `ledjer_admin_session=${token}` },
      }),
      env(db) as unknown as AdminEnv & { ASSETS: Fetcher; BACKUP_BUCKET?: R2Bucket },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      admin: { id: "admin-1", email: "admin@ledjer.id" },
    });
  });
});

describe("Admin auth guard", () => {
  it("rejects protected routes without a session (401)", async () => {
    const db = new FakeAdminD1();
    const response = await app.fetch(
      new Request("http://localhost/api/admin/users"),
      env(db) as unknown as AdminEnv & { ASSETS: Fetcher; BACKUP_BUCKET?: R2Bucket },
    );
    expect(response.status).toBe(401);
  });

  it("allows protected routes with a valid session", async () => {
    const db = new FakeAdminD1();
    await seedAdmin(db);
    const token = await adminSessionToken(db);
    db.users.push({
      id: "user-1",
      email: "owner@orga.test",
      full_name: "Owner A",
      status: "active",
      email_verified_at: Date.now(),
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const response = await app.fetch(
      new Request("http://localhost/api/admin/users", {
        headers: { Cookie: `ledjer_admin_session=${token}` },
      }),
      env(db) as unknown as AdminEnv & { ASSETS: Fetcher; BACKUP_BUCKET?: R2Bucket },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ total: 1 });
  });
});
