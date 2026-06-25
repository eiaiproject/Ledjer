import { createClient } from "@supabase/supabase-js";
import type { Database } from "@ledjer/database-types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const isPlaceholderUrl =
  !supabaseUrl ||
  supabaseUrl.includes("your-project") ||
  supabaseUrl.includes("example");

const isPlaceholderAnonKey =
  !supabaseAnonKey ||
  supabaseAnonKey.includes("your-anon-key") ||
  supabaseAnonKey.split(".").length !== 3;

/**
 * Validates environment configuration. Call BEFORE creating the client.
 * Returns null if valid, or an error message string if invalid.
 * Importing this module no longer throws at load time — the app renders
 * a configuration error page instead of a blank screen.
 */
export function getSupabaseConfigError(): string | null {
  if (isPlaceholderUrl || isPlaceholderAnonKey) {
    return "Konfigurasi Supabase belum lengkap. Salin apps/web/.env.example ke apps/web/.env.local, isi URL dan anon key yang benar, lalu restart Vite dev server.";
  }
  return null;
}

export const supabase = createClient<Database>(
  supabaseUrl || "http://localhost:54321",
  supabaseAnonKey || "placeholder-key",
);
