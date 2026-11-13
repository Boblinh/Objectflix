-- Objectflix video keys
-- Migration 0007: populate video_key for the 26 canonical BFDI season-1 episodes.
--
-- The B2 bucket (objectflix-videos) contains one file per episode named
-- bfdi/{episode_number}.mp4 (1a, 1b, 2-25). Migration 0005 added the column but
-- left it NULL; without a video_key the API cannot build a signed playback URL.
-- The hidden BFDI 26 editions already have keys from migration 0006.

UPDATE episodes SET video_key = 'bfdi/1a.mp4'  WHERE id = '30000000-0000-4000-8000-000000000001';
UPDATE episodes SET video_key = 'bfdi/1b.mp4'  WHERE id = '30000000-0000-4000-8000-000000000002';
UPDATE episodes SET video_key = 'bfdi/2.mp4'   WHERE id = '30000000-0000-4000-8000-000000000003';
UPDATE episodes SET video_key = 'bfdi/3.mp4'   WHERE id = '30000000-0000-4000-8000-000000000004';
UPDATE episodes SET video_key = 'bfdi/4.mp4'   WHERE id = '30000000-0000-4000-8000-000000000005';
UPDATE episodes SET video_key = 'bfdi/5.mp4'   WHERE id = '30000000-0000-4000-8000-000000000006';
UPDATE episodes SET video_key = 'bfdi/6.mp4'   WHERE id = '30000000-0000-4000-8000-000000000007';
UPDATE episodes SET video_key = 'bfdi/7.mp4'   WHERE id = '30000000-0000-4000-8000-000000000008';
UPDATE episodes SET video_key = 'bfdi/8.mp4'   WHERE id = '30000000-0000-4000-8000-000000000009';
UPDATE episodes SET video_key = 'bfdi/9.mp4'   WHERE id = '30000000-0000-4000-8000-00000000000a';
UPDATE episodes SET video_key = 'bfdi/10.mp4'  WHERE id = '30000000-0000-4000-8000-00000000000b';
UPDATE episodes SET video_key = 'bfdi/11.mp4'  WHERE id = '30000000-0000-4000-8000-00000000000c';
UPDATE episodes SET video_key = 'bfdi/12.mp4'  WHERE id = '30000000-0000-4000-8000-00000000000d';
UPDATE episodes SET video_key = 'bfdi/13.mp4'  WHERE id = '30000000-0000-4000-8000-00000000000e';
UPDATE episodes SET video_key = 'bfdi/14.mp4'  WHERE id = '30000000-0000-4000-8000-00000000000f';
UPDATE episodes SET video_key = 'bfdi/15.mp4'  WHERE id = '30000000-0000-4000-8000-000000000010';
UPDATE episodes SET video_key = 'bfdi/16.mp4'  WHERE id = '30000000-0000-4000-8000-000000000011';
UPDATE episodes SET video_key = 'bfdi/17.mp4'  WHERE id = '30000000-0000-4000-8000-000000000012';
UPDATE episodes SET video_key = 'bfdi/18.mp4'  WHERE id = '30000000-0000-4000-8000-000000000013';
UPDATE episodes SET video_key = 'bfdi/19.mp4'  WHERE id = '30000000-0000-4000-8000-000000000014';
UPDATE episodes SET video_key = 'bfdi/20.mp4'  WHERE id = '30000000-0000-4000-8000-000000000015';
UPDATE episodes SET video_key = 'bfdi/21.mp4'  WHERE id = '30000000-0000-4000-8000-000000000016';
UPDATE episodes SET video_key = 'bfdi/22.mp4'  WHERE id = '30000000-0000-4000-8000-000000000017';
UPDATE episodes SET video_key = 'bfdi/23.mp4'  WHERE id = '30000000-0000-4000-8000-000000000018';
UPDATE episodes SET video_key = 'bfdi/24.mp4'  WHERE id = '30000000-0000-4000-8000-000000000019';
UPDATE episodes SET video_key = 'bfdi/25.mp4'  WHERE id = '30000000-0000-4000-8000-00000000001a';
