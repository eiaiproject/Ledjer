import { describe, expect, it } from "vitest";
import { hashPassword, timingSafeEqual, verifyPassword } from "./password";
import { generateToken, hashToken } from "./tokens";

describe("Worker auth crypto", () => {
  it("hashes and verifies passwords with optional pepper", async () => {
    const hash = await hashPassword("correct horse battery staple", "pepper");

    expect(hash).toMatch(/^pbkdf2-sha256\$210000\$/);
    await expect(
      verifyPassword("correct horse battery staple", hash, "pepper"),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash, "pepper")).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword("correct horse battery staple", hash, "other-pepper"),
    ).resolves.toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("password", "not-a-valid-hash")).resolves.toBe(
      false,
    );
  });

  it("uses deterministic SHA-256 hashes for opaque tokens", async () => {
    const token = generateToken();
    const hash = await hashToken(token);

    expect(token).not.toBe(hash);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(hashToken(token)).resolves.toBe(hash);
  });

  it("compares strings without short-circuiting on length", () => {
    expect(timingSafeEqual("same", "same")).toBe(true);
    expect(timingSafeEqual("same", "different")).toBe(false);
    expect(timingSafeEqual("same", "same-but-longer")).toBe(false);
  });
});
