-- 008_mr_pipeline: status of the latest pipeline of an MR, for the indicator on the MR board.
-- A copy of GitLab data (cache_mr): read again on every board load, since a pipeline ends without the MR changing.

ALTER TABLE cache_mr ADD COLUMN pipeline TEXT;   -- GitLab status (success, failed, running...); NULL = no pipeline or not read
