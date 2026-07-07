import type { OrganizationContext } from "./services/organization.service";
import type { CurrentSessionRow, SessionUser } from "./services/session.service";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN?: string;
  COOKIE_DOMAIN?: string;
  EMAIL_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PASSWORD_PEPPER?: string;
  SENTRY_DSN?: string;
  SESSION_SECRET?: string;
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
