import type { Context } from "hono";
import { ZodError, type ZodType } from "zod";
import { badRequest } from "./errors";

/**
 * Fields whose values should be redacted in structured logs.
 */
export const REDACTED_FIELDS = new Set([
  "password", "currentPassword", "newPassword", "token", "idempotencyKey",
]);

export function redactedBody(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(redactedBody);
  if (body && typeof body === "object") {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      obj[key] = REDACTED_FIELDS.has(key) ? "[REDACTED]" : redactedBody(value);
    }
    return obj;
  }
  return body;
}

function logRequest(c: Context, body: unknown): void {
  const env = c.env as { APP_ENV?: string } | undefined;
  if (env?.APP_ENV === "test") return;

  const log = {
    level: "info",
    requestId: (c as any).get?.("requestId") ?? undefined,
    method: c.req.method,
    path: c.req.path,
    body: redactedBody(body),
  };
  console.log(JSON.stringify(log));
}

export async function readJson<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("invalid_json", "Request body must be valid JSON");
  }

  try {
    logRequest(c, body);
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw badRequest("validation_error", details || "Request body is invalid");
    }
    throw error;
  }
}
