-- Objectflix seed data
-- Migration 0011: Add the Inanimate Insanity show.
--
-- Idempotent by design: fixed UUIDs + INSERT OR IGNORE, so rerunning this
-- migration (or re-applying it) never creates duplicate rows.
--
-- Notes:
--   * Only the show metadata is seeded here. Seasons and episodes will be
--     added in a later migration, along with video_key rows when the MP4s
--     exist in Backblaze B2.
--   * The show id is 10000000-0000-4000-8000-000000000007, continuing the
--     existing franchise IDs (BFDI=001 ... BFDIE=006).
--   * When episodes are added later, their ids should start at
--     30000000-0000-4000-8000-000000000077 (the TPOT run ended at ...076).

-- Show: Inanimate Insanity
INSERT OR IGNORE INTO shows (id, title, description, image) VALUES
('10000000-0000-4000-8000-000000000007', 'Inanimate Insanity', 'Inanimate Insanity is an animated web series created by AnimationEpic, in which household objects compete in challenges to win a cash prize and avoid elimination.', NULL);
