import { describe, expect, it } from "vitest";
import { redactedBody, REDACTED_FIELDS } from "./json";

describe("redactedBody", () => {
  it("redacts password fields", () => {
    const input = { password: "secret123", name: "John" };
    expect(redactedBody(input)).toEqual({ password: "[REDACTED]", name: "John" });
  });

  it("redacts all sensitive fields", () => {
    const input = {
      password: "x",
      currentPassword: "y",
      newPassword: "z",
      token: "abc",
      idempotencyKey: "key-1",
      safeField: "hello",
    };
    const result = redactedBody(input) as Record<string, unknown>;
    for (const field of REDACTED_FIELDS) {
      expect(result[field]).toBe("[REDACTED]");
    }
    expect(result.safeField).toBe("hello");
  });

  it("redacts nested objects", () => {
    const input = { user: { password: "secret", name: "Alice" } };
    expect(redactedBody(input)).toEqual({ user: { password: "[REDACTED]", name: "Alice" } });
  });

  it("redacts arrays", () => {
    const input = [{ password: "s1" }, { password: "s2" }];
    expect(redactedBody(input)).toEqual([{ password: "[REDACTED]" }, { password: "[REDACTED]" }]);
  });

  it("handles primitive values", () => {
    expect(redactedBody(42)).toBe(42);
    expect(redactedBody("hello")).toBe("hello");
    expect(redactedBody(null)).toBeNull();
  });
});
