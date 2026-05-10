CREATE TABLE result_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_normalised TEXT NOT NULL UNIQUE,
  result_payload JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
