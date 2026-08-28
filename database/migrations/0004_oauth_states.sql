-- Single-use state values for outbound OAuth redirects (Stripe Connect,
-- MobilePay). Without one, a callback URL could be replayed against a
-- different signed-in user's session and attach someone else's account.

CREATE TABLE IF NOT EXISTS oauth_states (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  state_hash  TEXT NOT NULL UNIQUE,
  redirect_to TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_states_user_idx ON oauth_states (user_id);
CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states (expires_at);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oauth_states_isolation ON oauth_states;
CREATE POLICY oauth_states_isolation ON oauth_states
  USING (app_rls_bypassed() OR user_id = app_current_user_id())
  WITH CHECK (app_rls_bypassed() OR user_id = app_current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_states TO kroner_app;
