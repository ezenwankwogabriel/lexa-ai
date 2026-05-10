CREATE TABLE searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  raw_input TEXT NOT NULL,
  input_normalised TEXT NOT NULL,
  difficulty_score INT NOT NULL DEFAULT 5,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_searches_user_id ON searches(user_id);
CREATE INDEX idx_searches_input ON searches(input_normalised);
