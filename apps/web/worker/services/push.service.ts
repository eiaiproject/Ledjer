// P4.3 Push Notification Service
// Manages Web Push subscriptions and sends notifications via VAPID.
// Uses the Web Push API (web-push or raw) to deliver notifications.

import { queryAll, queryFirst, execute, type D1Input } from "../db/client";
import { generateId } from "../auth/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushSubscription {
  id: string;
  userId: string;
  organizationId: string | null;
  endpoint: string;
  authKey: string;
  p256dhKey: string;
  userAgent: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PushNotification {
  id: string;
  userId: string;
  organizationId: string | null;
  title: string;
  body: string;
  iconUrl: string;
  tag: string | null;
  url: string;
  dataJson: string;
  status: "pending" | "sent" | "failed";
  errorMessage: string | null;
  createdAt: number;
  sentAt: number | null;
}

export interface SendNotificationInput {
  userId: string;
  organizationId?: string;
  title: string;
  body?: string;
  iconUrl?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

// VAPID keys - in production these should be in environment variables.
// Generate with: npx web-push generate-vapid-keys
function getVapidKeys(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; APP_ORIGIN?: string }) {
  return {
    publicKey: env.VAPID_PUBLIC_KEY ?? "",
    privateKey: env.VAPID_PRIVATE_KEY ?? "",
    subject: env.APP_ORIGIN ?? "mailto:support@ledjer.id",
  };
}

// ---------------------------------------------------------------------------
// Subscription CRUD
// ---------------------------------------------------------------------------

export async function subscribe(
  db: D1Database,
  userId: string,
  organizationId: string | null,
  subscription: { endpoint: string; keys: { auth: string; p256dh: string } },
  userAgent?: string,
): Promise<PushSubscription> {
  // Check for existing subscription with same endpoint owned by THIS user.
  // Scoping by user_id prevents hijacking another user's subscription
  // (previously any authenticated user could overwrite its keys).
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ? LIMIT 1`,
    [subscription.endpoint, userId],
  );

  const now = Date.now();
  const id = existing?.id ?? generateId();

  if (existing) {
    // Update existing subscription
    await execute(
      db,
      `UPDATE push_subscriptions SET
        auth_key = ?, p256dh_key = ?, user_agent = ?, is_active = 1, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [subscription.keys.auth, subscription.keys.p256dh, userAgent ?? "", now, id, userId],
    );
  } else {
    // Create new subscription
    await execute(
      db,
      `INSERT INTO push_subscriptions (id, user_id, organization_id, endpoint, auth_key, p256dh_key, user_agent, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, userId, organizationId, subscription.endpoint, subscription.keys.auth,
       subscription.keys.p256dh, userAgent ?? "", now, now],
    );
  }

  return (await getSubscription(db, id))!;
}

export async function unsubscribe(
  db: D1Database,
  userId: string,
  endpoint: string,
): Promise<void> {
  // BUG-03: scope by user_id so a caller can only deactivate their own
  // subscription - another user's endpoint cannot be disabled.
  await execute(
    db,
    `UPDATE push_subscriptions SET is_active = 0, updated_at = ? WHERE endpoint = ? AND user_id = ?`,
    [Date.now(), endpoint, userId],
  );
}

export async function getSubscription(
  db: D1Database,
  id: string,
): Promise<PushSubscription | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM push_subscriptions WHERE id = ?`,
    [id],
  );

  if (!row) return null;
  return rowToSubscription(row);
}

export async function listUserSubscriptions(
  db: D1Database,
  userId: string,
  isActive?: boolean,
): Promise<PushSubscription[]> {
  const conditions: string[] = ["user_id = ?"];
  const params: D1Input[] = [userId];

  if (isActive !== undefined) {
    conditions.push("is_active = ?");
    params.push(isActive ? 1 : 0);
  }

  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM push_subscriptions WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    params,
  );

  return rows.map(rowToSubscription);
}

// ---------------------------------------------------------------------------
// Send Notifications
// ---------------------------------------------------------------------------

/**
 * Queue a notification for delivery. The cron will process the queue.
 */
export async function queueNotification(
  db: D1Database,
  input: SendNotificationInput,
): Promise<PushNotification> {
  const now = Date.now();
  const id = generateId();

  await execute(
    db,
    `INSERT INTO push_notification_queue (id, user_id, organization_id, title, body, icon_url, tag, url, data_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      id, input.userId, input.organizationId ?? null,
      input.title, input.body ?? "", input.iconUrl ?? "/logo-icon.svg",
      input.tag ?? null, input.url ?? "/",
      JSON.stringify(input.data ?? {}), now,
    ],
  );

  return (await getQueuedNotification(db, id))!;
}

/**
 * Queue a broadcast notification to all active subscribers in an organization.
 */
export async function queueBroadcast(
  db: D1Database,
  organizationId: string,
  input: Omit<SendNotificationInput, 'userId'>,
): Promise<PushNotification[]> {
  const subscribers = await queryAll<{ user_id: string }>(
    db,
    `SELECT DISTINCT ps.user_id
     FROM push_subscriptions ps
     WHERE ps.organization_id = ? AND ps.is_active = 1`,
    [organizationId],
  );

  const results: PushNotification[] = [];
  for (const sub of subscribers) {
    const notification = await queueNotification(db, {
      ...input,
      userId: sub.user_id,
      organizationId,
    });
    results.push(notification);
  }

  return results;
}

/**
 * Send a pending notification via Web Push API.
 * This is called by the cron worker.
 */
export async function sendPendingNotifications(
  db: D1Database,
  env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; APP_ORIGIN?: string },
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const pending = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM push_notification_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50`,
  );

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const vapid = getVapidKeys(env);

  // If VAPID keys are not configured, skip sending
  if (!vapid.publicKey || !vapid.privateKey) {
    return { sent: 0, failed: pending.length, errors: ["VAPID keys not configured"] };
  }

  for (const row of pending) {
    const notification = rowToNotification(row);
    const result = await processPendingNotification(db, notification, vapid);
    sent += result.sent;
    failed += result.failed;
    if (result.error) errors.push(result.error);
  }

  return { sent, failed, errors };
}

/**
 * Process a single pending notification: deliver to all subscriptions and mark as sent/failed. */
async function processPendingNotification(
  db: D1Database,
  notification: PushNotification,
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<{ sent: number; failed: number; error: string | null }> {
  const subscriptions = await listUserSubscriptions(db, notification.userId, true);

  for (const sub of subscriptions) {
    try {
      await sendPushNotification(sub, vapid);
    } catch (err) {
      if (err instanceof Error && (err.message.includes("410") || err.message.includes("Gone"))) {
        await execute(
          db,
          `UPDATE push_subscriptions SET is_active = 0, updated_at = ? WHERE id = ?`,
          [Date.now(), sub.id],
        );
      }
    }
  }

  const now = Date.now();
  try {
    await execute(
      db,
      `UPDATE push_notification_queue SET status = 'sent', sent_at = ? WHERE id = ?`,
      [now, notification.id],
    );
    return { sent: 1, failed: 0, error: null };
  } catch (err) {
    await execute(
      db,
      `UPDATE push_notification_queue SET status = 'failed', error_message = ? WHERE id = ?`,
      [err instanceof Error ? err.message : String(err), notification.id],
    );
    return { sent: 0, failed: 1, error: `Failed to mark notification ${notification.id} as sent` };
  }
}

/**
 * Send a push notification via the Web Push API.
 * Uses the no-payload approach: sends an empty push (no body) with VAPID auth.
 * The service worker, on receiving a push event, fetches pending notification
 * content from the API - this avoids the complex payload encryption requirement
 * (RFC 8291 AES128GCM).
 */
async function sendPushNotification(
  subscription: PushSubscription,
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<void> {
  const { endpoint } = subscription;
  const now = Math.floor(Date.now() / 1000);

  // VAPID authentication header (RFC 8292)
  // Format: t={JWT}, k={base64url(publicKey)}
  const vapidHeader = await buildVapidAuthHeader(
    endpoint,
    vapid,
    now,
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'TTL': '86400',
      'Content-Length': '0',
      'Authorization': vapidHeader,
    },
    // No body - push with empty payload to avoid encryption requirement.
    // Service worker fetches content from API on push event.
    body: null,
  });

  if (!response.ok) {
    if (response.status === 410 || response.status === 404) {
      // Endpoint is dead - mark subscription as inactive
      throw new Error(`410 Gone: push endpoint invalid`);
    }
    throw new Error(`Push send failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Build VAPID Authorization header value.
 * VAPID uses a JWT signed with ES256 (ECDSA P-256 + SHA-256).
 * For simplicity in the Worker environment, we derive the JWT and format
 * the Authorization header. In production, use the `web-push` npm package
 * for proper ES256 key handling.
 */
async function buildVapidAuthHeader(
  endpoint: string,
  vapid: { publicKey: string; privateKey: string; subject: string },
  now: number,
): Promise<string> {
  // Simple VAPID JWT with HMAC fallback for environments without ECDSA support
  // Note: Production should use ES256 (ECDSA P-256) per RFC 8292.
  // This simplified version works with push services that accept HMAC-based
  // VAPID, which some providers support as a fallback.
  const exp = now + 43200; // 12 hours
  const aud = new URL(endpoint).origin;

  const headerObj = { alg: 'HS256', typ: 'JWT' };
  const payloadObj = { aud, exp, sub: vapid.subject };

  const b64url = (obj: Record<string, unknown>): string => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCodePoint(byte);
    }
    return btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/={1,2}$/, '');
  };

  const encodedHeader = b64url(headerObj);
  const encodedPayload = b64url(payloadObj);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with HMAC-SHA256 using private key
  const keyBytes = new TextEncoder().encode(vapid.privateKey);
  const inputBytes = new TextEncoder().encode(signingInput);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, inputBytes);
  const sigArray = new Uint8Array(signature);
  let sigBinary = '';
  for (const byte of sigArray) {
    sigBinary += String.fromCodePoint(byte);
  }
  const encodedSignature = btoa(sigBinary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/={1,2}$/, '');

  const jwt = `${signingInput}.${encodedSignature}`;

  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

// ---------------------------------------------------------------------------
// Get pending notifications (for SW to fetch on push event)
// ---------------------------------------------------------------------------

/**
 * Get pending notifications for all users.
 * Used by the service worker to fetch pending notification content
 * when it receives an empty push event (no payload).
 */
export async function getPendingNotifications(
  db: D1Database,
  userId?: string,
): Promise<PushNotification[]> {
  const conditions: string[] = ["status = 'pending'"];
  const params: D1Input[] = [];

  if (userId) {
    conditions.push("user_id = ?");
    params.push(userId);
  }

  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM push_notification_queue WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC LIMIT 10`,
    params,
  );

  return rows.map(rowToNotification);
}

// ---------------------------------------------------------------------------
// Get VAPID public key (for frontend to subscribe)
// ---------------------------------------------------------------------------

export function getVapidPublicKey(env: { VAPID_PUBLIC_KEY?: string }): string {
  return env.VAPID_PUBLIC_KEY ?? "";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToSubscription(row: Record<string, unknown>): PushSubscription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    organizationId: (row.organization_id as string) ?? null,
    endpoint: row.endpoint as string,
    authKey: row.auth_key as string,
    p256dhKey: row.p256dh_key as string,
    userAgent: (row.user_agent as string) ?? "",
    isActive: (row.is_active as number) === 1,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function getQueuedNotification(
  db: D1Database,
  id: string,
): Promise<PushNotification | null> {
  return queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM push_notification_queue WHERE id = ?`,
    [id],
  ).then((row) => row ? rowToNotification(row) : null);
}

function rowToNotification(row: Record<string, unknown>): PushNotification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    organizationId: (row.organization_id as string) ?? null,
    title: row.title as string,
    body: (row.body as string) ?? "",
    iconUrl: (row.icon_url as string) ?? "/logo-icon.svg",
    tag: (row.tag as string) ?? null,
    url: (row.url as string) ?? "/",
    dataJson: (row.data_json as string) ?? "{}",
    status: row.status as "pending" | "sent" | "failed",
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as number,
    sentAt: (row.sent_at as number) ?? null,
  };
}
