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

export async function readJson<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<T> {
  const contentType = c.req.header("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    throw badRequest("invalid_content_type", "Content-Type must be application/json");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("invalid_json", "Request body must be valid JSON");
  }

  try {
    // Request bodies are intentionally not logged: they are user-controlled
    // data (tssecurity:S5145). The request logger middleware records the
    // request lifecycle with a correlating requestId instead.
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
