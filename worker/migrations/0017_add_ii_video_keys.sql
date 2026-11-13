-- Objectflix seed data
-- Migration 0017: Wire video_key values for every Inanimate Insanity episode.
--
-- Naming follows the catalog convention <prefix>/<episode_number>.<ext>:
--   Season 1 (original):        ii/<n>.mp4            (n = 1..18 plus 5.5)
--   Season 1 Remastered:        ii/remastered/<n>.mp4 (n = 1..14)
--
-- The media files are not uploaded to B2 yet; keys are set in advance so the
-- episodes start streaming as soon as objects land at these paths.
-- Idempotent: only fills NULL video_key rows.

UPDATE episodes
SET video_key = 'ii/' || episode_number || '.mp4'
WHERE season_id = '20000000-0000-4000-8000-000000000008'
  AND video_key IS NULL;

UPDATE episodes
SET video_key = 'ii/remastered/' || episode_number || '.mp4'
WHERE season_id = '20000000-0000-4000-8000-000000000009'
  AND video_key IS NULL;
