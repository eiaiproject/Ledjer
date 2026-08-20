import type { Context } from "hono";
import { ZodError, type ZodType } from "zod";
import type { AppContext } from "../env";
import { badRequest } from "./errors";

export async function readJson<T>(
  c: Context<AppContext>,
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
