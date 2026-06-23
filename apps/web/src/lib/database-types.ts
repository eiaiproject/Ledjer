/**
 * @deprecated This file is a thin compatibility shim.
 * The canonical, generated Supabase database types live in the
 * `@ledjer/database-types` workspace package and are regenerated from
 * `supabase/migrations` via the `db-types:check` script.
 *
 * Import from `@ledjer/database-types` instead.
 *
 *   import type { Database, Json } from "@ledjer/database-types";
 *
 * This shim exists only so that legacy imports continue to type-check
 * during the migration window. New code MUST import from the package.
 */

export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from "@ledjer/database-types";
