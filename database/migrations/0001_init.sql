-- Kroner: core schema.
-- Money is stored as BIGINT minor units (øre). Never NUMERIC/FLOAT for amounts.

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  email_lower    TEXT GENERATED ALWAYS AS (lower(email)) STORED,
  display_name   TEXT,
  password_hash  TEXT NOT NULL,
  tracking_mode  TEXT NOT NULL DEFAULT 'both'
                 CHECK (tracking_mode IN ('personal','business','both')),
  base_currency  TEXT NOT NULL DEFAULT 'DKK',
  demo_mode      BOOLEAN NOT NULL DEFAULT TRUE,
  onboarding_completed_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (email_lower);

-- Sessions store only a hash of the opaque token; the raw token lives in the cookie.
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent    TEXT,
  ip            TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

CREATE TABLE IF NOT EXISTS bank_connections (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  institution_id      TEXT NOT NULL,
  institution_name    TEXT NOT NULL,
  external_reference  TEXT,
  status              TEXT NOT NULL DEFAULT 'never'
                      CHECK (status IN ('never','syncing','ok','error','expired','revoked')),
  scope               TEXT NOT NULL DEFAULT 'read_only' CHECK (scope = 'read_only'),
  consent_expires_at  TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ,
  sync_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_connections_user_idx ON bank_connections (user_id);

-- Encrypted provider tokens. Ciphertext only; the key never lives in this table.
CREATE TABLE IF NOT EXISTS integration_tokens (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL,
  connection_id  UUID REFERENCES bank_connections(id) ON DELETE CASCADE,
  purpose        TEXT NOT NULL DEFAULT 'access',
  ciphertext     TEXT NOT NULL,
  iv             TEXT NOT NULL,
  auth_tag       TEXT NOT NULL,
  key_version    INT  NOT NULL DEFAULT 1,
  scopes         TEXT[] NOT NULL DEFAULT '{}',
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, connection_id, purpose)
);
CREATE INDEX IF NOT EXISTS integration_tokens_user_idx ON integration_tokens (user_id);

CREATE TABLE IF NOT EXISTS stripe_connections (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL,
  account_name     TEXT,
  livemode         BOOLEAN NOT NULL DEFAULT FALSE,
  status           TEXT NOT NULL DEFAULT 'never'
                   CHECK (status IN ('never','syncing','ok','error','expired','revoked')),
  last_synced_at   TIMESTAMPTZ,
  sync_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, stripe_account_id)
);

CREATE TABLE IF NOT EXISTS financial_accounts (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  connection_id       UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  institution         TEXT,
  masked_reference    TEXT,
  type                TEXT NOT NULL DEFAULT 'checking',
  currency            TEXT NOT NULL DEFAULT 'DKK',
  balance_minor       BIGINT,
  balance_updated_at  TIMESTAMPTZ,
  ownership           TEXT NOT NULL DEFAULT 'personal'
                      CHECK (ownership IN ('personal','business','mixed')),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS financial_accounts_user_idx ON financial_accounts (user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                        UUID PRIMARY KEY,
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_key              TEXT NOT NULL,
  merchant_label            TEXT NOT NULL,
  category                  TEXT NOT NULL,
  ownership                 TEXT NOT NULL DEFAULT 'personal',
  interval                  TEXT NOT NULL,
  amount_minor              BIGINT NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'DKK',
  monthly_equivalent_minor  BIGINT NOT NULL,
  annual_equivalent_minor   BIGINT NOT NULL,
  first_seen                DATE NOT NULL,
  last_payment_date         DATE NOT NULL,
  next_predicted_date       DATE NOT NULL,
  occurrences               INT NOT NULL,
  confidence                REAL NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','lapsed','cancelled')),
  price_changed_at          DATE,
  previous_amount_minor     BIGINT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_key, interval)
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id    TEXT NOT NULL,
  provider          TEXT NOT NULL,
  account_id        UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  amount_minor      BIGINT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'DKK',
  transaction_date  DATE NOT NULL,
  booking_date      DATE,
  merchant          TEXT,
  merchant_key      TEXT,
  description       TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'miscellaneous',
  subcategory       TEXT,
  transaction_type  TEXT NOT NULL DEFAULT 'expense',
  ownership         TEXT NOT NULL DEFAULT 'personal'
                    CHECK (ownership IN ('personal','business','mixed')),
  recurring_status  TEXT NOT NULL DEFAULT 'one_off',
  subscription_id   UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  tax_relevant      TEXT NOT NULL DEFAULT 'needs_review',
  confidence_score  REAL NOT NULL DEFAULT 0,
  category_locked   BOOLEAN NOT NULL DEFAULT FALSE,
  dedupe_hash       TEXT NOT NULL,
  notes             TEXT,
  original_provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Hard guarantee: a provider transaction can exist at most once per user.
  UNIQUE (user_id, provider, transaction_id)
);
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS transactions_user_category_idx ON transactions (user_id, category);
CREATE INDEX IF NOT EXISTS transactions_user_ownership_idx ON transactions (user_id, ownership);
CREATE INDEX IF NOT EXISTS transactions_user_merchant_idx ON transactions (user_id, merchant_key);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id);
CREATE INDEX IF NOT EXISTS transactions_dedupe_idx ON transactions (user_id, dedupe_hash);
CREATE INDEX IF NOT EXISTS transactions_subscription_idx ON transactions (subscription_id);

CREATE TABLE IF NOT EXISTS merchant_rules (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_type   TEXT NOT NULL DEFAULT 'merchant_key'
               CHECK (match_type IN ('merchant_key','contains')),
  pattern      TEXT NOT NULL,
  category     TEXT NOT NULL,
  subcategory  TEXT,
  ownership    TEXT,
  tax_relevant TEXT,
  source       TEXT NOT NULL DEFAULT 'user_correction'
               CHECK (source IN ('user_correction','seed')),
  hit_count    INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_type, pattern)
);
CREATE INDEX IF NOT EXISTS merchant_rules_user_idx ON merchant_rules (user_id);

CREATE TABLE IF NOT EXISTS financial_insights (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  facts         JSONB NOT NULL DEFAULT '{}'::jsonb,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'info',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS financial_insights_user_idx ON financial_insights (user_id, created_at DESC);

-- What the assistant was asked and which deterministic tools ran.
-- Stores no computed financial values.
CREATE TABLE IF NOT EXISTS ai_queries (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT NOT NULL,
  tools_used    TEXT[] NOT NULL DEFAULT '{}',
  model         TEXT,
  latency_ms    INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_queries_user_idx ON ai_queries (user_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
