import type { ErrorHandler } from "hono";
import type { AppContext } from "../env";
import { HttpError } from "../http/errors";

export const errorHandler: ErrorHandler<AppContext> = (error, c) => {
  const requestId = c.get("requestId") ?? crypto.randomUUID();

  if (error instanceof HttpError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      },
      error.status,
    );
  }

  console.error("Unhandled Worker error", {
    message: error instanceof Error ? error.message : String(error),
    requestId,
  });

  return c.json(
    {
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId,
      },
    },
    500,
  );
};
