-- Row-level security. Defence in depth: even a query that forgets its
-- `WHERE user_id = ...` clause returns nothing.
--
-- The app opens every request-scoped transaction with
--   SET LOCAL app.user_id = '<uuid>'
-- Trusted internal work (migrations, auth lookups, the seeder) instead sets
--   SET LOCAL app.bypass_rls = 'on'
-- which is only ever issued from database/system.ts, never from a request path.

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE raw TEXT;
BEGIN
  raw := current_setting('app.user_id', true);
  IF raw IS NULL OR raw = '' THEN RETURN NULL; END IF;
  RETURN raw::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app_rls_bypassed() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on';
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'financial_accounts','bank_connections','stripe_connections','transactions',
    'merchant_rules','subscriptions','financial_insights','integration_tokens',
    'ai_queries','audit_logs','sessions','password_resets'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (app_rls_bypassed() OR user_id = app_current_user_id())
       WITH CHECK (app_rls_bypassed() OR user_id = app_current_user_id())',
      t || '_isolation', t);
  END LOOP;
END $$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users
  USING (app_rls_bypassed() OR id = app_current_user_id())
  WITH CHECK (app_rls_bypassed() OR id = app_current_user_id());
