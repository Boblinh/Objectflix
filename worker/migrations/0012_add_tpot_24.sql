-- Objectflix TPOT 24
-- Migration 0012: add the newly released TPOT episode 24.
--
-- The B2 object key for this episode is tpot/24.webm.
-- A subtitle row is also wired so the episode can
-- play with captions as soon as the media files exist in the bucket.
--
-- Idempotent by design: fixed UUID + INSERT OR IGNORE, and the season's
-- episode_count is bumped only when the episode row was actually added.

INSERT OR IGNORE INTO episodes (id, season_id, show_id, episode_number, title, description, image) VALUES
('30000000-0000-4000-8000-000000000077', '20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '24', 'BFDI:TPOT 24: That''s What Foes Are For', NULL, NULL);

UPDATE episodes
SET video_key = 'tpot/24.webm'
WHERE id = '30000000-0000-4000-8000-000000000077'
  AND video_key IS NULL;

-- Keep the TPOT season's episode count in sync (23 -> 24)
UPDATE seasons
SET episode_count = 24
WHERE id = '20000000-0000-4000-8000-000000000005'
  AND episode_count < 24;

-- English subtitle for TPOT 24
INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a1b2c3d4-0000-4000-8000-000000000024', id, 'en', '/media/tpot/24.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000077'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000077' AND language = 'en');
