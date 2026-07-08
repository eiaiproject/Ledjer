import { Hono } from "hono";
import type { AppContext } from "./env";
import { csrfProtection } from "./middleware/csrf.middleware";
import { errorHandler } from "./middleware/error.middleware";
import { requestId } from "./middleware/request-id.middleware";
import { secureHeaders } from "./middleware/secure-headers.middleware";
import { accountsRoutes } from "./routes/accounts.routes";
import { authRoutes } from "./routes/auth.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { exportsRoutes } from "./routes/exports.routes";
import { healthRoutes } from "./routes/health.routes";
import { inventoryRoutes } from "./routes/inventory.routes";
import { organizationRoutes } from "./routes/organization.routes";
import { partiesRoutes } from "./routes/parties.routes";
import { periodLocksRoutes } from "./routes/period-locks.routes";
import { productsRoutes } from "./routes/products.routes";
import { reportsRoutes } from "./routes/reports.routes";
import { teamRoutes } from "./routes/team.routes";
import { transactionsRoutes } from "./routes/transactions.routes";
import { cleanupExpiredRows } from "./services/maintenance.service";

const app = new Hono<AppContext>();

app.onError(errorHandler);
app.use("*", requestId());
app.use("*", secureHeaders());
app.use("/api/*", csrfProtection());

app.route("/api/auth", authRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/organizations", organizationRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/parties", partiesRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/inventory", inventoryRoutes);
app.route("/api/transactions", transactionsRoutes);
app.route("/api/reports", reportsRoutes);
app.route("/api/team", teamRoutes);
app.route("/api/exports", exportsRoutes);
app.route("/api/period-locks", periodLocksRoutes);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json(
      {
        error: {
          code: "not_found",
          message: "API route not found",
          requestId: c.get("requestId"),
        },
      },
      404,
    );
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export { app };

export default {
  fetch(request: Request, env: AppContext["Bindings"], ctx?: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(
    _controller: ScheduledController,
    env: AppContext["Bindings"],
  ) {
    await cleanupExpiredRows(env.DB);
  },
};
