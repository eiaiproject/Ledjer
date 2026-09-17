import { describe, it, expect, beforeEach } from "vitest";
import { saveOfflineSession, loadOfflineSession, clearOfflineSession } from "./offline-auth";
import type { AuthUser, AuthSession } from "@/lib/api/auth";

const USER: AuthUser = { id: "u1", email: "a@b.com", full_name: "Ana", business_name: "Toko Ana" };
const SESSION: AuthSession = { id: "s1", user_id: "u1", expires_at: Date.now() + 1000000 };

beforeEach(async () => {
  await clearOfflineSession();
  try {
    localStorage.clear();
  } catch {
    // jsdom may not have localStorage in some env
  }
});

describe("offline-auth", () => {
  it("save lalu load kembali (enkripsi round-trip)", async () => {
    await saveOfflineSession(USER, SESSION);
    const loaded = await loadOfflineSession();
    expect(loaded?.user.id).toBe(USER.id);
    expect(loaded?.session?.id).toBe(SESSION.id);
    expect(loaded?.v).toBe(1);
  });

  it("clear menghapus sesi", async () => {
    await saveOfflineSession(USER, SESSION);
    await clearOfflineSession();
    expect(await loadOfflineSession()).toBeNull();
  });

  it("load null bila belum pernah save", async () => {
    expect(await loadOfflineSession()).toBeNull();
  });

  it("tanpa session (null) tetap tersimpan", async () => {
    await saveOfflineSession(USER, null);
    const loaded = await loadOfflineSession();
    expect(loaded?.user.id).toBe(USER.id);
    expect(loaded?.session).toBeNull();
  });
});
