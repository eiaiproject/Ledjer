import { describe, expect, it } from "vitest";
import { translateError } from "./errors";

describe("translateError", () => {
  it("maps raw TypeError and internal errors to the generic Indonesian fallback", () => {
    const rawTypeError = new TypeError("Cannot read properties of undefined (reading 'role')");
    expect(translateError(rawTypeError)).toBe("Terjadi kesalahan. Silakan coba lagi.");

    const internalError = new Error("Failed to execute helper function");
    expect(translateError(internalError)).toBe("Terjadi kesalahan. Silakan coba lagi.");
  });

  it("translates Worker error codes", () => {
    expect(translateError({ code: "journal_unbalanced" })).toBe("Jurnal transaksi tidak seimbang.");
    expect(translateError({ code: "account_name_taken" })).toBe("Nama akun sudah dipakai dalam organisasi ini.");
    expect(translateError({ code: "invalid_credentials" })).toBe("Email atau password salah.");
  });

  it("translates known Worker messages", () => {
    expect(translateError(new Error("Invalid email or password"))).toBe("Email atau password salah.");
    expect(translateError(new Error("Failed to fetch"))).toBe(
      "Gagal terhubung ke server. Periksa koneksi internet Anda.",
    );
  });
});
