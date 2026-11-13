-- Migration 0022: let subtitles resolve to non-default B2 buckets.
--
-- The media proxy (src/index.js episodeBucket) now also looks up
-- subtitles.url, so subtitle rows can carry an explicit bucket.

ALTER TABLE subtitles ADD COLUMN bucket TEXT;

-- BFB 2's Vietnamese track lives in the second bucket (objectflix-videos-2).
UPDATE subtitles
SET bucket = 'objectflix-videos-2'
WHERE id = '12ba92bf-67c9-40bb-886d-0da42ed44fb1'
  AND bucket IS NULL;

-- Keep TPOT 25's episode bucket assignment reproducible in migration history.
UPDATE episodes
SET bucket = 'objectflix-videos-2'
WHERE id = '30000000-0000-4000-8000-0000000000a4'
  AND bucket IS NULL;