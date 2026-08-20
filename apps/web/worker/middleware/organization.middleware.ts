import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../env";
import { forbidden } from "../http/errors";
import {
  getCurrentOrganization,
  requirePermission as assertPermission,
  type Permission,
} from "../services/organization.service";

export function loadCurrentOrganization(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const context = await getCurrentOrganization(c.env.DB, c.get("session"));
    if (!context.organization || !context.member) {
      throw forbidden("organization_required", "Organization membership is required");
    }

    // ponytail: Platform admins can disable an organization from the admin
    // dashboard (admin.ledjer.id). Disabled orgs are read-only for members:
    // every org-scoped API call is rejected until the org is re-enabled.
    if (context.organization.status === "disabled") {
      throw forbidden("organization_disabled", "Organization is disabled by the platform administrator");
    }

    c.set("organizationContext", {
      organization: context.organization,
      member: context.member,
    });
    await next();
  };
}

export function requirePermission(permission: Permission): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const context = c.get("organizationContext");
    assertPermission(context.member, permission);
    await next();
  };
}
