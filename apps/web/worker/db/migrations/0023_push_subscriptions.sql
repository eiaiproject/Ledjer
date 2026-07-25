PRAGMA foreign_keys = ON;

-- Push notification subscriptions per user.
-- Each user can have multiple devices subscribed.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT,
  endpoint TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Queue for pending push notifications (batched delivery via cron).
CREATE TABLE IF NOT EXISTS push_notification_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  icon_url TEXT DEFAULT '/logo-icon.svg',
  tag TEXT,
  url TEXT DEFAULT '/',
  data_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_notification_queue_status ON push_notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_push_notification_queue_user ON push_notification_queue(user_id);

UPDATE app_metadata SET value = '23' WHERE key = 'schema.foundation';
