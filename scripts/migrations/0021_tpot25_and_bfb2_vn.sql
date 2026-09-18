-- Objectflix media wiring
-- Migration 0021: point TPOT 25 at its B2 media and add BFB 2 Vietnamese subtitles.
--
-- Files (tpot/25.mp4, bfb/2.vn.ass) live in the objectflix-videos bucket; this
-- migration wires the episode rows so the API can build playback URLs and serve
-- the Vietnamese track alongside the existing English one.
--
-- Idempotent: UPDATE is scoped to the one episode and the subtitle insert uses
-- a fixed UUID + INSERT OR IGNORE.

UPDATE episodes
SET video_key = 'tpot/25.mp4'
WHERE id = '30000000-0000-4000-8000-0000000000a4'
  AND video_key IS NULL;

-- Vietnamese subtitles for BFB 2
INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '12ba92bf-67c9-40bb-886d-0da42ed44fb1', id, 'vn', '/media/bfb/2.vn.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000038'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000038' AND language = 'vn');