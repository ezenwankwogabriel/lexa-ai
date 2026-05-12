CREATE OR REPLACE VIEW mastered_words AS
SELECT
  rq.user_id,
  rq.input_normalised,
  rq.repetition_count,
  rq.last_performance,
  rq.ease_factor,
  rc.result_payload
FROM review_queue rq
JOIN result_cache rc ON rc.input_normalised = rq.input_normalised
WHERE rq.repetition_count >= 5 AND rq.last_performance >= 4;
