import { captureException } from "@sentry/cloudflare";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../env";
import { HttpError } from "../http/errors";

export const errorHandler: ErrorHandler<AppContext> = (error, c) => {
  const requestId = c.get("requestId") ?? crypto.randomUUID();
  c.header("X-Request-Id", requestId);

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

  if (error instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: "request_rejected",
          message: error.message,
          requestId,
        },
      },
      error.status,
    );
  }

  // Send unexpected errors to Sentry
  captureException(error, {
    tags: { requestId },
    extra: { code: error instanceof HttpError ? error.code : "internal_error" },
    level: "error",
  });

  console.error(JSON.stringify({
    time: new Date().toISOString(),
    level: "error",
    type: "unhandled_error",
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : typeof error,
    requestId,
    env: c.env.APP_ENV ?? "development",
  }));

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
