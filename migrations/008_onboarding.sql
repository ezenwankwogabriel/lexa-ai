-- ─── Cluster taxonomy ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clusters (
  id   SERIAL PRIMARY KEY,
  name TEXT   NOT NULL UNIQUE
);

INSERT INTO clusters (name) VALUES
  ('professional'), ('expression'), ('thinking'), ('character'),
  ('communication'), ('emotional'), ('interpersonal')
ON CONFLICT (name) DO NOTHING;

-- ─── Onboarding word list ─────────────────────────────────────────────────────
-- One row per word-cluster mapping. display_weight 2 = prominent pill on screen.

CREATE TABLE IF NOT EXISTS onboarding_words (
  id             SERIAL  PRIMARY KEY,
  word           TEXT    NOT NULL,
  cluster_id     INTEGER NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  display_weight INTEGER NOT NULL DEFAULT 1,
  UNIQUE(word, cluster_id)
);

INSERT INTO onboarding_words (word, cluster_id, display_weight) VALUES
  -- professional
  ('pragmatic',     (SELECT id FROM clusters WHERE name='professional'), 2),
  ('meticulous',    (SELECT id FROM clusters WHERE name='professional'), 2),
  ('concise',       (SELECT id FROM clusters WHERE name='professional'), 2),
  ('articulate',    (SELECT id FROM clusters WHERE name='professional'), 2),
  ('strategic',     (SELECT id FROM clusters WHERE name='professional'), 1),
  ('proficient',    (SELECT id FROM clusters WHERE name='professional'), 1),
  ('diligent',      (SELECT id FROM clusters WHERE name='professional'), 1),
  ('methodical',    (SELECT id FROM clusters WHERE name='professional'), 1),
  -- expression
  ('eloquent',      (SELECT id FROM clusters WHERE name='expression'), 2),
  ('vivid',         (SELECT id FROM clusters WHERE name='expression'), 1),
  ('compelling',    (SELECT id FROM clusters WHERE name='expression'), 2),
  ('nuanced',       (SELECT id FROM clusters WHERE name='expression'), 1),
  ('evocative',     (SELECT id FROM clusters WHERE name='expression'), 1),
  ('expressive',    (SELECT id FROM clusters WHERE name='expression'), 1),
  ('articulate',    (SELECT id FROM clusters WHERE name='expression'), 2),
  ('lucid',         (SELECT id FROM clusters WHERE name='expression'), 1),
  -- thinking
  ('pragmatic',     (SELECT id FROM clusters WHERE name='thinking'), 2),
  ('astute',        (SELECT id FROM clusters WHERE name='thinking'), 2),
  ('analytical',    (SELECT id FROM clusters WHERE name='thinking'), 1),
  ('discerning',    (SELECT id FROM clusters WHERE name='thinking'), 1),
  ('perceptive',    (SELECT id FROM clusters WHERE name='thinking'), 1),
  ('inquisitive',   (SELECT id FROM clusters WHERE name='thinking'), 1),
  ('rational',      (SELECT id FROM clusters WHERE name='thinking'), 1),
  ('objective',     (SELECT id FROM clusters WHERE name='thinking'), 1),
  -- character
  ('resilient',     (SELECT id FROM clusters WHERE name='character'), 2),
  ('candid',        (SELECT id FROM clusters WHERE name='character'), 2),
  ('tenacious',     (SELECT id FROM clusters WHERE name='character'), 1),
  ('principled',    (SELECT id FROM clusters WHERE name='character'), 1),
  ('composed',      (SELECT id FROM clusters WHERE name='character'), 1),
  ('empathetic',    (SELECT id FROM clusters WHERE name='character'), 2),
  ('steadfast',     (SELECT id FROM clusters WHERE name='character'), 1),
  -- communication
  ('candid',        (SELECT id FROM clusters WHERE name='communication'), 2),
  ('persuasive',    (SELECT id FROM clusters WHERE name='communication'), 1),
  ('articulate',    (SELECT id FROM clusters WHERE name='communication'), 2),
  ('concise',       (SELECT id FROM clusters WHERE name='communication'), 2),
  ('assertive',     (SELECT id FROM clusters WHERE name='communication'), 1),
  ('diplomatic',    (SELECT id FROM clusters WHERE name='communication'), 1),
  ('succinct',      (SELECT id FROM clusters WHERE name='communication'), 1),
  ('coherent',      (SELECT id FROM clusters WHERE name='communication'), 1),
  -- emotional
  ('resilient',     (SELECT id FROM clusters WHERE name='emotional'), 2),
  ('empathetic',    (SELECT id FROM clusters WHERE name='emotional'), 2),
  ('composed',      (SELECT id FROM clusters WHERE name='emotional'), 1),
  ('reflective',    (SELECT id FROM clusters WHERE name='emotional'), 1),
  ('genuine',       (SELECT id FROM clusters WHERE name='emotional'), 1),
  ('sincere',       (SELECT id FROM clusters WHERE name='emotional'), 1),
  ('passionate',    (SELECT id FROM clusters WHERE name='emotional'), 1),
  -- interpersonal
  ('candid',        (SELECT id FROM clusters WHERE name='interpersonal'), 2),
  ('diplomatic',    (SELECT id FROM clusters WHERE name='interpersonal'), 1),
  ('empathetic',    (SELECT id FROM clusters WHERE name='interpersonal'), 2),
  ('assertive',     (SELECT id FROM clusters WHERE name='interpersonal'), 1),
  ('collaborative', (SELECT id FROM clusters WHERE name='interpersonal'), 1),
  ('perceptive',    (SELECT id FROM clusters WHERE name='interpersonal'), 1),
  ('transparent',   (SELECT id FROM clusters WHERE name='interpersonal'), 1),
  ('receptive',     (SELECT id FROM clusters WHERE name='interpersonal'), 1)
ON CONFLICT (word, cluster_id) DO NOTHING;

-- ─── User preferences ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cluster_id INTEGER NOT NULL REFERENCES clusters(id),
  score      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, cluster_id)
);

-- ─── Users: onboarding columns ───────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS usage_context TEXT NOT NULL DEFAULT 'general'
    CHECK (usage_context IN ('work', 'writing', 'conversation', 'general')),
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- ─── Review queue: source + initial_interval_days ────────────────────────────

ALTER TABLE review_queue
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'search'
    CHECK (source IN ('search', 'onboarding')),
  ADD COLUMN IF NOT EXISTS initial_interval_days INTEGER NOT NULL DEFAULT 1;
