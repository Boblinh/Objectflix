-- Objectflix seed data
-- Migration 0016: Retitle II Season 1 Remastered episodes.
--
-- Old format: "II 1R 1: The Crappy Cliff"
-- New format: "II 1: The Crappy Cliff (Remastered)"
--
-- Idempotent: only touches rows still carrying the old "II 1R" prefix.

UPDATE episodes
SET title = replace(title, 'II 1R ', 'II ') || ' (Remastered)'
WHERE season_id = '20000000-0000-4000-8000-000000000009'
  AND title LIKE 'II 1R %';
