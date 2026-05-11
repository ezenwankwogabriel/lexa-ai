-- users: timezone support
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- review_queue: spaced-repetition scheduling
CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id UUID REFERENCES searches(id) ON DELETE SET NULL,
  input_normalised TEXT NOT NULL,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 day',
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  repetition_count INTEGER NOT NULL DEFAULT 0,
  last_performance INTEGER CHECK (last_performance BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, input_normalised)
);

CREATE INDEX IF NOT EXISTS idx_review_queue_due
  ON review_queue(user_id, next_review_at);

-- trigger: auto-queue every searched word without resetting review progress on re-search
CREATE OR REPLACE FUNCTION queue_word_for_review()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO review_queue (user_id, word_id, input_normalised)
  VALUES (NEW.user_id, NEW.id, NEW.input_normalised)
  ON CONFLICT (user_id, input_normalised) DO UPDATE
    SET updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_search_insert ON searches;
CREATE TRIGGER after_search_insert
  AFTER INSERT ON searches
  FOR EACH ROW EXECUTE FUNCTION queue_word_for_review();
