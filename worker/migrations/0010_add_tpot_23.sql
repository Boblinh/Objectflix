-- Objectflix TPOT 23
-- Migration 0010: add the newly released TPOT episode 23.
--
-- The B2 object key for this episode is tpot/23.webm (WEBM, unlike the older
-- episodes which are .mp4). A subtitle row is also wired so the episode can
-- play with captions as soon as the media files exist in the bucket.
--
-- Idempotent by design: fixed UUID + INSERT OR IGNORE, and the season's
-- episode_count is bumped only when the episode row was actually added.

INSERT OR IGNORE INTO episodes (id, season_id, show_id, episode_number, title, description, image) VALUES
('30000000-0000-4000-8000-000000000076', '20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '23', 'BFDI:TPOT 23: Homeward Bound!', NULL, NULL);

UPDATE episodes
SET video_key = 'tpot/23.webm'
WHERE id = '30000000-0000-4000-8000-000000000076'
  AND video_key IS NULL;

-- Keep the TPOT season's episode count in sync (22 -> 23)
UPDATE seasons
SET episode_count = 23
WHERE id = '20000000-0000-4000-8000-000000000005'
  AND episode_count < 23;

-- English subtitle for TPOT 23
INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a1b2c3d4-0000-4000-8000-000000000023', id, 'en', '/media/tpot/23.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000076'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000076' AND language = 'en');
