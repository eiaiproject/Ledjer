import { describe, expect, it } from "vitest";
import { translateError } from "./errors";

describe("translateError", () => {
  it("maps raw TypeError and internal errors to the generic Indonesian fallback", () => {
    const rawTypeError = new TypeError("Cannot read properties of undefined (reading 'role')");
    expect(translateError(rawTypeError)).toBe("Terjadi kesalahan. Silakan coba lagi.");

    const internalError = new Error("Failed to execute helper function");
    expect(translateError(internalError)).toBe("Terjadi kesalahan. Silakan coba lagi.");
  });

  it("passes through known backend exceptions with SQLSTATE P0001 verbatim", () => {
    // As PostgrestError object
    const pgError = {
      code: "P0001",
      message: "Jurnal tidak seimbang",
    };
    expect(translateError(pgError)).toBe("Jurnal tidak seimbang");

    // As Error object with code attached
    const errorWithCode = new Error("Harga pokok produk belum diatur");
    (errorWithCode as Error & { code?: string }).code = "P0001";
    expect(translateError(errorWithCode)).toBe("Harga pokok produk belum diatur");
  });

  it("translates mapped error codes and messages correctly", () => {
    // 23505 duplicate
    expect(translateError({ code: "23505" })).toBe("Data sudah ada (duplikat).");

    // invalid_credentials auth message
    const authError = new Error("invalid_credentials: login failed");
    expect(translateError(authError)).toBe("Email atau password salah.");
  });
});
