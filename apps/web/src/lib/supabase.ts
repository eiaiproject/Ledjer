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

if (isPlaceholderUrl || isPlaceholderAnonKey) {
  throw new Error(
    "Invalid VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Create apps/web/.env.local from apps/web/.env.example, fill real Supabase credentials, and restart the Vite dev server."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
