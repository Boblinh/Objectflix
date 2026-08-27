-- Objectflix ARG Easter Egg
-- Migration 0006: Add a hidden flag and seed the two hidden BFDI 26 episodes.
--
-- These episodes are NOT part of the canonical BFDI episode list. They are the
-- ARG easter egg: "BFDI 26: Flower's Revenge" (the recovered real edition) and
-- its Story Accurate (PowerPoint) counterpart. They are excluded from every
-- listing endpoint and can only be fetched directly by their secret UUIDs
-- (plus the unlock header), so normal viewers never see them.

ALTER TABLE episodes ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

-- BFDI 26: Flower's Revenge (real edition) - video: bfdi/26.mp4
INSERT INTO episodes (id, season_id, show_id, episode_number, title, description, image, video_key, hidden)
VALUES (
  'f855fc40-5d4b-4d9f-ab37-722a8c82bca5',
  '20000000-0000-4000-8000-000000000001', -- BFDI season
  '10000000-0000-4000-8000-000000000001', -- BFDI show
  '26',
  'BFDI 26: Flower''s Revenge',
  NULL,
  NULL,
  'bfdi/26.mp4',
  1
);

-- BFDI 26: Flower's Revenge (Story Accurate edition) - video: bfdi/26_story.mp4
INSERT INTO episodes (id, season_id, show_id, episode_number, title, description, image, video_key, hidden)
VALUES (
  'c7506d25-b99c-4e7b-abd8-c1158ae124c7',
  '20000000-0000-4000-8000-000000000001', -- BFDI season
  '10000000-0000-4000-8000-000000000001', -- BFDI show
  '26',
  'BFDI 26: Flower''s Revenge (Story Accurate)',
  NULL,
  NULL,
  'bfdi/26_story.mp4',
  1
);
