-- review_queue: pre-generated distractors for fill_blank / recall question types
ALTER TABLE review_queue
  ADD COLUMN IF NOT EXISTS distractors JSONB DEFAULT NULL;
