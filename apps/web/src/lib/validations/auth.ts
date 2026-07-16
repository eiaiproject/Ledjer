import { z } from "zod/v3";

/**
 * Shared password validation schema used by both register and reset-password forms.
 * Rules: min 8 chars, max 72 chars, at least 1 uppercase letter, at least 1 digit.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password harus minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter")
  .regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar")
  .regex(/\d/, "Password harus mengandung minimal 1 angka");
