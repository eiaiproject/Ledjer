import type { AdminSessionRow } from "./services/admin-session.service";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BACKUP_BUCKET?: R2Bucket;
  APP_ORIGIN?: string;
  APP_ENV?: string;
  GIT_SHA?: string;
  /** Pepper for admin password hashing — separate from the main app's PASSWORD_PEPPER. */
  ADMIN_PASSWORD_PEPPER?: string;
  /** Used to send password-reset emails from the admin panel (same API key as the main app). */
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  SENTRY_DSN?: string;
  /** Origin of the main user app (https://ledjer.id) — used for password-reset links. */
  USER_APP_ORIGIN?: string;
  /** Service binding to the main worker (ledjer). Used by the health check.
   *  Worker-to-Worker calls via public *.workers.dev hostname fail with
   *  CF error 1042 ("could not resolve host") from the internal resolver,
   *  so this binding is required for cross-worker health probes. */
  MAIN_APP?: Fetcher;
}

export interface AppContext {
  Bindings: Env;
  Variables: {
    requestId: string;
    adminSession: AdminSessionRow;
  };
}
