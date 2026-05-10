ALTER TABLE searches
  ADD CONSTRAINT searches_user_input_time_unique
  UNIQUE (user_id, input_normalised, searched_at);
