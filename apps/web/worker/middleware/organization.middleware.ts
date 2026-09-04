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
    if (!context?.organization || !context.member) {
      throw forbidden("organization_required", "Organization membership is required");
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
    // loadCurrentOrganization runs first and throws when the context is
    // missing, so the context is guaranteed to be set here.
    const context = c.get("organizationContext");
    if (!context) {
      throw forbidden("organization_required", "Organization membership is required");
    }
    assertPermission(context.member, permission);
    await next();
  };
}
