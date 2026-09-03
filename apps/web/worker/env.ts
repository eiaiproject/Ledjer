import type { OrganizationContext } from "./services/organization.service";
import type { CurrentSessionRow, SessionUser } from "./services/session.service";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BACKUP_BUCKET?: R2Bucket;
  APP_ORIGIN?: string;
  COOKIE_DOMAIN?: string;
  PASSWORD_PEPPER?: string;
  SENTRY_DSN?: string;
  APP_ENV?: string;
  GIT_SHA?: string;
}

export interface AppContext {
  Bindings: Env;
  Variables: {
    requestId: string;
    session: CurrentSessionRow;
    user: SessionUser;
    organizationContext: OrganizationContext;
  };
}
