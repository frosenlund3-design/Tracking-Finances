-- Everything in a life that wants organising, and the game layer over it.
--
-- Design note that the rest of the schema follows from: there is no streak
-- column anywhere. A streak is a number whose whole purpose is to be broken,
-- and an app that punishes a missed Tuesday is an app that gets deleted on
-- Wednesday. What is stored instead is momentum — a value that rises quickly,
-- decays slowly, and never falls below a floor already earned.

-- The player. One row per user, created on first XP grant.
CREATE TABLE IF NOT EXISTS life_player (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp               INTEGER NOT NULL DEFAULT 0,
  momentum         INTEGER NOT NULL DEFAULT 0,
  -- Momentum can never decay below this. Earned by reaching each new tier and
  -- kept forever, so a bad fortnight costs a little and never everything.
  momentum_floor   INTEGER NOT NULL DEFAULT 0,
  last_active_on   DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every grant, so the number can always be explained.
CREATE TABLE IF NOT EXISTS xp_events (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,
  action      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xp_events_user_time_idx ON xp_events (user_id, created_at DESC);

-- What you have collected. Keys are defined in code, never here.
CREATE TABLE IF NOT EXISTS collectibles (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Barcode lookups, cached. Public product data, shared across users, so this
-- table deliberately has no user_id: knowing that Arla Letmælk exists tells
-- nobody anything about anybody.
CREATE TABLE IF NOT EXISTS products (
  barcode            TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  brand              TEXT,
  category           TEXT,
  quantity_text      TEXT,
  -- How long it usually keeps once opened, in days. Used to propose a date.
  shelf_days         INTEGER,
  -- Which Danish waste fraction the packaging belongs in.
  packaging_fraction TEXT,
  source             TEXT NOT NULL DEFAULT 'manual',
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What is actually in the kitchen.
CREATE TABLE IF NOT EXISTS pantry_items (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  barcode     TEXT,
  name        TEXT NOT NULL,
  -- fridge | freezer | pantry
  location    TEXT NOT NULL DEFAULT 'fridge',
  quantity    INTEGER NOT NULL DEFAULT 1,
  expires_on  DATE,
  opened_on   DATE,
  -- in | eaten | frozen | binned
  status      TEXT NOT NULL DEFAULT 'in',
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pantry_user_status_idx ON pantry_items (user_id, status, expires_on);

-- Dinner. Recipes themselves live in the repo as data; only the plan is
-- personal, so a recipe fix ships with a deploy instead of a migration.
CREATE TABLE IF NOT EXISTS meal_plan (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date   DATE NOT NULL,
  recipe_key  TEXT NOT NULL,
  -- planned | cooked | skipped
  status      TEXT NOT NULL DEFAULT 'planned',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date)
);

-- Routines: training, skincare, medication, anything repeated.
CREATE TABLE IF NOT EXISTS routines (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  area            TEXT NOT NULL DEFAULT 'body',
  icon            TEXT NOT NULL DEFAULT 'spark',
  -- A weekly target, not a daily one. Seven chances to hit four.
  target_per_week INTEGER NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS routine_events (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  done_on    DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, routine_id, done_on)
);
CREATE INDEX IF NOT EXISTS routine_events_user_date_idx ON routine_events (user_id, done_on DESC);

-- Which sorting bins the home actually has. Denmark sorts into ten fractions
-- by national scheme; most homes have some of them and guess at the rest.
CREATE TABLE IF NOT EXISTS home_bins (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fraction   TEXT NOT NULL,
  -- have | missing | unknown
  status     TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fraction)
);

-- Things that run out: toilet paper, dishwasher tabs, contact lenses.
CREATE TABLE IF NOT EXISTS supplies (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  icon           TEXT NOT NULL DEFAULT 'box',
  -- How many days one purchase usually lasts.
  typical_days   INTEGER NOT NULL DEFAULT 30,
  last_bought_on DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at    TIMESTAMPTZ
);

-- Game results, for personal bests and for the board.
CREATE TABLE IF NOT EXISTS game_runs (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game        TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_runs_user_game_idx ON game_runs (user_id, game, score DESC);

-- Same isolation as everything else: a query that forgets its WHERE clause
-- returns nothing. `products` is excluded on purpose — it is a public cache.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'life_player','xp_events','collectibles','pantry_items','meal_plan',
    'routines','routine_events','home_bins','supplies','game_runs'
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

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO kroner_app;
