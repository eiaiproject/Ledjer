import type { ErrorHandler } from "hono";
import { errorHandler as webErrorHandler } from "../../../web/worker/middleware/error.middleware";
import type { AppContext } from "../env";

export const errorHandler: ErrorHandler<AppContext> = webErrorHandler as unknown as ErrorHandler<AppContext>;
