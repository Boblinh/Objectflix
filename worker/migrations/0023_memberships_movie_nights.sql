-- Additive: existing catalog, profiles, community data, and media keys are preserved.
-- New timestamps use Unix seconds. Legacy tables retain their existing units.
CREATE TABLE IF NOT EXISTS account_users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'discord')),
  provider_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  legacy_account TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_sessions_expiry ON account_sessions(expires_at);

CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT PRIMARY KEY REFERENCES account_users(id),
  stripe_customer_id TEXT NOT NULL UNIQUE,
  livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id),
  stripe_customer_id TEXT NOT NULL,
  price_id TEXT,
  plan_id TEXT NOT NULL DEFAULT 'newbie',
  status TEXT NOT NULL,
  entitled_plan_id TEXT NOT NULL DEFAULT 'newbie',
  paid_through INTEGER NOT NULL DEFAULT 0,
  current_period_end INTEGER NOT NULL DEFAULT 0,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  cancel_at INTEGER,
  latest_invoice_status TEXT,
  livemode INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  verified_event_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user ON billing_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS billing_checkouts (
  user_id TEXT PRIMARY KEY REFERENCES account_users(id),
  request_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  session_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_leases (
  resource TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Only a minimal, signature-verified event envelope is retained, never card data.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  customer_id TEXT,
  subscription_id TEXT,
  object_id TEXT,
  livemode INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processed', 'ignored')),
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhook_pending ON stripe_webhook_events(state, next_attempt_at);

CREATE TABLE IF NOT EXISTS member_preferences (
  user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
  frame TEXT NOT NULL DEFAULT 'none',
  theme TEXT NOT NULL DEFAULT 'default',
  decoration TEXT NOT NULL DEFAULT 'none',
  show_badge INTEGER NOT NULL DEFAULT 1,
  show_title INTEGER NOT NULL DEFAULT 0,
  recognition_opt_in INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member_feature_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS movie_night_rights (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  rights_holder TEXT NOT NULL,
  permission_reference TEXT NOT NULL,
  valid_from INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  revoked_at INTEGER,
  approved_by TEXT NOT NULL REFERENCES account_users(id),
  created_at INTEGER NOT NULL,
  CHECK (valid_until > valid_from)
);

CREATE TABLE IF NOT EXISTS movie_nights (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled')),
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  rights_id TEXT NOT NULL REFERENCES movie_night_rights(id),
  announce_at INTEGER NOT NULL,
  priority_announce_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES account_users(id),
  updated_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at),
  CHECK (priority_announce_at <= announce_at)
);
CREATE INDEX IF NOT EXISTS idx_movie_night_schedule ON movie_nights(starts_at);

CREATE TABLE IF NOT EXISTS movie_night_attendees (
  event_id TEXT NOT NULL REFERENCES movie_nights(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES account_users(id),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS movie_night_suggestions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES movie_nights(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES account_users(id),
  theme TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movie_suggestions_event ON movie_night_suggestions(event_id, created_at);

CREATE TABLE IF NOT EXISTS movie_night_polls (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES movie_nights(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  min_plan TEXT NOT NULL DEFAULT 'newbie',
  opens_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES account_users(id),
  CHECK (closes_at > opens_at)
);

CREATE TABLE IF NOT EXISTS movie_night_poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES movie_night_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (poll_id, id)
);

CREATE TABLE IF NOT EXISTS movie_night_votes (
  poll_id TEXT NOT NULL REFERENCES movie_night_polls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES account_users(id),
  option_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id),
  FOREIGN KEY (poll_id, option_id) REFERENCES movie_night_poll_options(poll_id, id)
);
