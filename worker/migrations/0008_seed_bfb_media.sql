-- Objectflix media wiring
-- Migration 0008: point BFB episode 2 at its B2 media (video + subtitles).
-- The files (bfb/2.mp4, bfb/2.ass) are already uploaded to the objectflix-videos
-- bucket; this migration wires the existing episode row to them so the API can
-- build a playback URL and serve subtitles.

UPDATE episodes SET video_key = 'bfb/2.mp4'
WHERE id = '30000000-0000-4000-8000-000000000038';

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
VALUES ('0adb29d0-1f16-4eba-9e94-a8ba35279abb', '30000000-0000-4000-8000-000000000038', 'en', '/media/bfb/2.ass');
