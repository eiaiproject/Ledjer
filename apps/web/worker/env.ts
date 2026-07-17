import type { OrganizationContext } from "./services/organization.service";
import type { CurrentSessionRow, SessionUser } from "./services/session.service";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN?: string;
  COOKIE_DOMAIN?: string;
  EMAIL_API_KEY?: string;
EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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
