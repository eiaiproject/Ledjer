// P4.3 Push Notification Client
// Handles browser subscription, unsubscription, and VAPID key retrieval.

export interface PushSubscriptionData {
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

// ── VAPID Public Key ─────────────────────────────────────────────

export async function getVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/push/vapid-public-key');
  if (!res.ok) throw new Error('Failed to fetch VAPID public key');
  const data = await res.json() as { publicKey: string };
  return data.publicKey;
}

// ── Subscription Management ──────────────────────────────────────

/**
 * Subscribe the current browser for push notifications.
 * Requires the user to grant notification permission.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key
    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      console.warn('VAPID public key not configured');
      return false;
    }

    // Convert base64 key to Uint8Array
    const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey as unknown as BufferSource,
    });

    // Send subscription to server
    const subJson = subscription.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        userAgent: navigator.userAgent,
      }),
    });

    if (!res.ok) throw new Error('Failed to save subscription');
    return true;
  } catch (err) {
    console.error('Failed to subscribe to push:', err);
    return false;
  }
}

/**
 * Unsubscribe the current browser from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) return true;

    const endpoint = subscription.endpoint;

    // Unsubscribe from browser
    await subscription.unsubscribe();

    // Notify server
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });

    return true;
  } catch (err) {
    console.error('Failed to unsubscribe from push:', err);
    return false;
  }
}

/**
 * Check if push is already subscribed.
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

// ── Helper: URL base64 to Uint8Array ────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replaceAll('-', '+')
    .replaceAll('_', '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.codePointAt(i) ?? 0;
  }

  return outputArray;
}
