-- Spilkataloget skriver til den samme game_runs-tabel, men har brug for to
-- ting mere: hvilken sværhedsgrad runden blev spillet på, og om den blev
-- gennemført eller forladt halvvejs.
--
-- Forladte runder gemmes med vilje. "Du kom halvvejs gennem badeværelset"
-- er sandt og brugbart; at slette forsøget ville gøre historikken til en
-- liste over sejre, og så er den ikke en historik.

ALTER TABLE game_runs
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'mellem';

ALTER TABLE game_runs
  ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT TRUE;

-- Historikken læses altid pr. bruger og altid nyeste først.
CREATE INDEX IF NOT EXISTS game_runs_user_recent_idx
  ON game_runs (user_id, created_at DESC);
