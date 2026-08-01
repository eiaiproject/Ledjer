import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";

import {
  subscribe,
  unsubscribe,
  listUserSubscriptions,
  getVapidPublicKey,
  getPendingNotifications,
} from "../services/push.service";

const subscriptionKeysSchema = z.object({
  auth: z.string().min(1),
  p256dh: z.string().min(1),
});

const subscribeSchema = z.object({
  endpoint: z.url(),
  keys: subscriptionKeysSchema,
  userAgent: z.string().optional(),
});

export const pushRoutes = new Hono<AppContext>();

// Public: get VAPID public key for subscription
pushRoutes.get("/vapid-public-key", async (c) => {
  const publicKey = getVapidPublicKey(c.env as { VAPID_PUBLIC_KEY?: string });
  return c.json({ publicKey });
});

// Authenticated endpoints
pushRoutes.use("/subscribe", requireAuth());
pushRoutes.use("/unsubscribe", requireAuth());
pushRoutes.use("/subscriptions", requireAuth());

pushRoutes.post("/subscribe", async (c) => {
  const body = await readJson(c, subscribeSchema);
  const user = c.get("user");
  // Organization context is optional for push
  const context = c.get("organizationContext") as { organization?: { id: string } } | undefined;
  const orgId = context?.organization?.id ?? null;

  const subscription = await subscribe(
    c.env.DB,
    user.id,
    orgId,
    { endpoint: body.endpoint, keys: body.keys },
    body.userAgent,
  );

  return c.json({ subscription });
});

pushRoutes.post("/unsubscribe", async (c) => {
  const body = await readJson(c, z.object({ endpoint: z.url() }));
  await unsubscribe(c.env.DB, body.endpoint);
  return c.json({ success: true });
});

pushRoutes.get("/subscriptions", async (c) => {
  const user = c.get("user");
  const subscriptions = await listUserSubscriptions(c.env.DB, user.id);
  return c.json({ subscriptions });
});

// Endpoint for service worker to fetch pending notifications.
// Auth'd via session cookie (same-origin SW fetch includes cookies automatically).
pushRoutes.use("/notifications/pending", requireAuth());
pushRoutes.get("/notifications/pending", async (c) => {
  const user = c.get("user");
  const notifications = await getPendingNotifications(c.env.DB, user.id);
  return c.json({ notifications });
});
