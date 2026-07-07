import type { Context } from "hono";
import { ZodError, type ZodType } from "zod";
import { badRequest } from "./errors";

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
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw badRequest("validation_error", "Request body is invalid");
    }
    throw error;
  }
}
