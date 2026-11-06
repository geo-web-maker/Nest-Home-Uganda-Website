-- Browser (Web Push) subscriptions for the admin PWA, one row per browser per person.
CREATE TABLE IF NOT EXISTS web_push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS web_push_subscription_user_idx ON web_push_subscription(user_id);
