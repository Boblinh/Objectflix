-- Objectflix TPOT 25
-- Migration 0014: add the newly released TPOT episode 25.
--
-- Idempotent by design: fixed UUID + INSERT OR IGNORE, and the season's
-- episode_count is bumped only when the episode row was actually added.

INSERT OR IGNORE INTO episodes (id, season_id, show_id, episode_number, title, description, image) VALUES
('30000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '25', 'BFDI:TPOT 25: All For One', 'Defeat One. Once and for all.', NULL);

-- Keep the TPOT season's episode count in sync (24 -> 25)
UPDATE seasons
SET episode_count = 25
WHERE id = '20000000-0000-4000-8000-000000000005'
  AND episode_count < 25;
