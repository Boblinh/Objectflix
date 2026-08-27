-- Objectflix media wiring
-- Migration 0009: pre-add a video_key and an 'en' subtitle row for every
-- episode that does not already have one, following the <show>/<episode_number>
-- B2 object-key convention (bfdi/, bfdia/, bfb/, tpot/, idfb/, bfdie/).
--
-- "Pre-add" is intentional: the media files may not be uploaded to B2 yet.
-- Wiring the keys now means the API can build playback/subtitle URLs as soon
-- as each object exists, and no code change is needed when files land.
--
-- Idempotent: only fills episodes missing a video_key, and only inserts a
-- subtitle where the episode has no 'en' track yet.

UPDATE episodes
SET video_key = CASE show_id
  WHEN '10000000-0000-4000-8000-000000000001' THEN 'bfdi/'  || episode_number || '.mp4'
  WHEN '10000000-0000-4000-8000-000000000002' THEN 'bfdia/' || episode_number || '.mp4'
  WHEN '10000000-0000-4000-8000-000000000003' THEN 'bfb/'   || episode_number || '.mp4'
  WHEN '10000000-0000-4000-8000-000000000004' THEN 'tpot/'  || episode_number || '.mp4'
  WHEN '10000000-0000-4000-8000-000000000005' THEN 'idfb/'  || episode_number || '.mp4'
  WHEN '10000000-0000-4000-8000-000000000006' THEN 'bfdie/' || episode_number || '.mp4'
  ELSE NULL
END
WHERE video_key IS NULL;

-- English subtitles for every episode lacking one
INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'd18ce12a-8218-4400-ac0f-0fe05f1eeb05', id, 'en', '/media/bfdi/1a.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000001' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '29f6af6b-8539-4251-91d6-b0521e93afa2', id, 'en', '/media/bfdi/1b.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000002'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000002' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'c64fa583-de2a-4d7a-9eb0-f760c5295007', id, 'en', '/media/bfdi/2.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000003'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000003' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'cab972e1-8367-403e-9118-0742b8b936f4', id, 'en', '/media/bfdi/3.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000004'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000004' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '46323d18-1bb1-4d2f-a193-e9de7910ab05', id, 'en', '/media/bfdi/4.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000005'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000005' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '608ff2ad-491a-4cfa-8398-a7ea176fcb25', id, 'en', '/media/bfdi/5.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000006'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000006' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '87350c96-e090-4a7e-bb1e-3631f242d4e0', id, 'en', '/media/bfdi/6.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000007'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000007' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'def821e6-e43b-4559-abbe-854a8fd4815f', id, 'en', '/media/bfdi/7.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000008'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000008' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '6014fe99-6479-4311-953b-92877d13c30d', id, 'en', '/media/bfdi/8.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000009'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000009' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'c3b51a0f-23aa-42fd-b403-e72c296a0aba', id, 'en', '/media/bfdi/9.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000000a'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000000a' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'd54a2965-6d55-49d5-b45e-1ccd23cdc44d', id, 'en', '/media/bfdi/10.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000000b'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000000b' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '41b1ccef-1d9f-4d49-9e95-10f7d95333d1', id, 'en', '/media/bfdi/11.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000000c'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000000c' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '7c572a27-f597-43aa-83ea-d8c61af3c697', id, 'en', '/media/bfdi/12.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000000d'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000000d' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '2c8b5f91-bbec-46cd-9ceb-ce549800b8ef', id, 'en', '/media/bfdi/13.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000000e'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000000e' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '8b9ec6bd-b19b-40f2-94d2-78ab5685c1ea', id, 'en', '/media/bfdi/14.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000000f'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000000f' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '23120a42-6ae0-4a55-b8b4-8157abe922d1', id, 'en', '/media/bfdi/15.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000010'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000010' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'd5b03f28-ac03-45cf-9d26-8a8855265f6d', id, 'en', '/media/bfdi/16.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000011'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000011' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '4cd15cff-1245-41f6-9156-1db9c0bb28df', id, 'en', '/media/bfdi/17.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000012'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000012' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '79ff24ad-4f84-4e62-bb98-0decbe46c486', id, 'en', '/media/bfdi/18.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000013'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000013' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '506623d4-c61b-45e3-b99d-12a35d96d860', id, 'en', '/media/bfdi/19.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000014'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000014' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '7bf30b01-2f22-4ab0-a6e9-995743784d6e', id, 'en', '/media/bfdi/20.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000015'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000015' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'df13404b-8a7f-4821-8e9a-289ff2713d63', id, 'en', '/media/bfdi/21.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000016'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000016' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '3d8ac075-6727-45e3-bc52-a0cb9325aeee', id, 'en', '/media/bfdi/22.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000017'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000017' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'f40beddc-2c54-406f-a94f-b71c5609b53f', id, 'en', '/media/bfdi/23.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000018'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000018' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '12b4bfab-2ca2-4202-a303-3bed75c3a1a0', id, 'en', '/media/bfdi/24.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000019'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000019' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '7a042c37-8080-4567-86cb-2fb9cfdc1341', id, 'en', '/media/bfdi/25.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000001a'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000001a' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '0292e5b0-7464-42e1-9c5b-518faa40046a', id, 'en', '/media/bfdi/26.ass'
FROM episodes
WHERE id = 'f855fc40-5d4b-4d9f-ab37-722a8c82bca5'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = 'f855fc40-5d4b-4d9f-ab37-722a8c82bca5' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '81eb2935-5d65-4dab-8946-e75a31fdc08e', id, 'en', '/media/bfdi/26.ass'
FROM episodes
WHERE id = 'c7506d25-b99c-4e7b-abd8-c1158ae124c7'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = 'c7506d25-b99c-4e7b-abd8-c1158ae124c7' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '9ea3355b-6fa8-4aae-8b35-196f16594cb6', id, 'en', '/media/bfdia/1.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000001b'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000001b' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '8e05c424-5d4e-44fb-b880-c3032274bd79', id, 'en', '/media/bfdia/2.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000001c'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000001c' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'b202513e-3508-4a3b-85d3-01ff11d8f7d8', id, 'en', '/media/bfdia/3.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000001d'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000001d' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'da040933-433f-4ad1-984e-19a74d2d93b6', id, 'en', '/media/bfdia/4.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000001e'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000001e' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a75d5fc1-6c2f-4862-b40e-8ec3061158d8', id, 'en', '/media/bfdia/5a.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000001f'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000001f' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '813b2520-72ea-4a67-9c65-b1387dcd2640', id, 'en', '/media/bfdia/5c.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000020'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000020' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '40ec4e22-d7fb-4190-aed3-eb59a0e46a1c', id, 'en', '/media/bfdia/5d.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000021'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000021' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '29c1a29a-3bfa-45a5-9ced-495f61ac0ffc', id, 'en', '/media/bfdia/5e.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000022'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000022' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'eae67c03-5999-47d8-997d-0a0aa4ba3ada', id, 'en', '/media/bfdia/6.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000023'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000023' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'b8d7f713-020c-4034-9656-7a9cbef7a6e4', id, 'en', '/media/bfdia/7.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000024'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000024' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'd4ea4f9a-d904-458e-8f82-6a0fb440b906', id, 'en', '/media/bfdia/8.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000025'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000025' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '9f8c8ed6-a02d-43f4-b29c-9c31368c8eeb', id, 'en', '/media/bfdia/9.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000026'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000026' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'b02746fa-d243-4255-9a08-a2f156f1cb27', id, 'en', '/media/bfdia/10.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000027'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000027' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'e01fb38b-f3a3-4041-beb7-d05c81f96a75', id, 'en', '/media/bfdia/11.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000028'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000028' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '3440b4e1-a448-4a9e-98cd-ed535fd93379', id, 'en', '/media/bfdia/12.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000029'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000029' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '2d8d13aa-5784-4d61-a289-2dbd94917f83', id, 'en', '/media/bfdia/13.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000002a'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000002a' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '1e8024de-7fc4-47f0-b5d2-276068fe18c6', id, 'en', '/media/bfdia/14.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000002b'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000002b' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '3bd962b5-0260-48f5-bdc5-1d818057c99a', id, 'en', '/media/bfdia/15.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000002c'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000002c' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '837cabc4-f41c-4fcb-ad56-11cc8ffaf5b8', id, 'en', '/media/bfdia/16.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000002d'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000002d' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '1bb858eb-6130-4393-853b-a5b715742a94', id, 'en', '/media/bfdia/17.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000002e'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000002e' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '7ff3441b-0313-4ba2-9d44-a919fb376475', id, 'en', '/media/bfdia/18.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000002f'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000002f' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'b9438a5f-8116-43a5-b58e-f37dad4cf652', id, 'en', '/media/bfdia/19.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000030'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000030' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '6878a33f-9818-464a-9f6b-336a71a4ca1b', id, 'en', '/media/bfdia/20.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000031'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000031' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '4c3bf668-863b-46a5-8c11-2c6fcb0da933', id, 'en', '/media/bfdia/21.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000032'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000032' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '11e60578-aba0-467b-b594-4de187ccfd81', id, 'en', '/media/bfdia/22.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000033'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000033' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '89c380fe-a006-4e28-8573-fa0145ad691d', id, 'en', '/media/bfdia/23.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000034'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000034' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '1392d7a4-756a-4027-bb1e-edec7555123a', id, 'en', '/media/bfdia/24.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000035'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000035' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '0ee2834b-a326-4586-a71e-3ee7c45ac966', id, 'en', '/media/bfdia/25.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000036'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000036' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'f181cc89-38bd-4381-8d73-71431986210d', id, 'en', '/media/bfb/1.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000037'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000037' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'e6e5084a-3c4c-42ae-aeb4-66f26a4b8f95', id, 'en', '/media/bfb/2.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000038'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000038' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '126ea7fb-10c0-4f19-b9d2-01cfe7c8b6a9', id, 'en', '/media/bfb/3.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000039'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000039' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '6d899c5d-f677-4b6c-a11a-e0e4694a319e', id, 'en', '/media/bfb/4.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000003a'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000003a' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '80093de9-8b15-4b93-a623-f9cdf5f1ecd2', id, 'en', '/media/bfb/5.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000003b'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000003b' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '75d9af87-0a5c-4c9b-af1a-f8bdbf8e5b4e', id, 'en', '/media/bfb/6.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000003c'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000003c' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '39c3f211-ee90-4491-894b-9b347c6d83e9', id, 'en', '/media/bfb/7.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000003d'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000003d' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a12dd46c-dbac-4073-b4da-f2d48726d843', id, 'en', '/media/bfb/8.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000003e'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000003e' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '518f9fd2-5158-440b-b771-f4b81b759f58', id, 'en', '/media/bfb/9.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000003f'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000003f' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '628d9fbb-d12b-4c12-9451-cc244394405e', id, 'en', '/media/bfb/10.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000040'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000040' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '3d8b84d8-ed48-4ffb-a462-e5268bca1865', id, 'en', '/media/bfb/11.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000041'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000041' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'dae5fefb-388e-442d-b399-b2f28cb1fbcc', id, 'en', '/media/bfb/12.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000042'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000042' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '54ff9244-1b80-4c8c-a036-254d6b11dc2f', id, 'en', '/media/bfb/13.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000043'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000043' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'c189e5c3-e100-457b-82a3-f48a93c0ca41', id, 'en', '/media/bfb/14.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000044'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000044' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '4b770849-7392-4e4d-b333-986ddd264f76', id, 'en', '/media/bfb/15.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000045'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000045' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '600ffe91-3672-4487-97f7-f01c7945fe68', id, 'en', '/media/bfb/16.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000046'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000046' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a47fc52d-cdcd-4607-834d-174ebbab7697', id, 'en', '/media/bfb/17.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000047'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000047' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '7f03ad98-e951-466e-ae72-6900bef83c09', id, 'en', '/media/bfb/18.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000048'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000048' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '65730b1c-1c95-40b6-ac39-2422e44fbff9', id, 'en', '/media/bfb/19.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000049'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000049' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '1647bccd-c5cd-4c0b-937e-ff2c7347f2eb', id, 'en', '/media/bfb/20.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000004a'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000004a' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '630917a4-3c8e-4715-aa0d-ab925d8b47ff', id, 'en', '/media/bfb/21.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000004b'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000004b' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '655fdc62-ed79-4953-af12-fef95661808e', id, 'en', '/media/bfb/22.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000004c'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000004c' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '3613428f-7fed-49ee-9b40-1fb12af0f375', id, 'en', '/media/bfb/23.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000004d'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000004d' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '9f925e62-5681-439a-ba9e-9013350df15e', id, 'en', '/media/bfb/24.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000004e'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000004e' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '8299569f-ad25-4886-9f46-a67ac14e4fd2', id, 'en', '/media/bfb/25.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000004f'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000004f' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'da5b1b15-4965-4067-aefd-b272aadb37a8', id, 'en', '/media/bfb/26.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000050'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000050' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '44d0ea97-7492-450e-9318-841ee2acfa55', id, 'en', '/media/bfb/27.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000051'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000051' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '21ceb949-de15-4919-9d4c-419da9f64266', id, 'en', '/media/bfb/28.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000052'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000052' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '2c8df0ce-0f56-4d37-a8f7-e3ce9fd42c47', id, 'en', '/media/bfb/29.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000053'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000053' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'e0413d44-4ca3-4e4f-8af2-efe0dbe3d355', id, 'en', '/media/bfb/30.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000054'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000054' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '781137a1-ef35-4f01-bddd-f9caa6d98f87', id, 'en', '/media/tpot/1.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000055'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000055' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'c7419072-e878-4bda-9db7-007f8317be1c', id, 'en', '/media/tpot/2.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000056'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000056' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'b15ff028-3392-4ea6-bfb8-8a66a8964cfb', id, 'en', '/media/tpot/3.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000057'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000057' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a69fdbfe-09f5-4b08-ba69-171d4daec95d', id, 'en', '/media/tpot/4.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000058'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000058' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '97b023ce-b9dc-455d-a199-ba09930a516f', id, 'en', '/media/tpot/5.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000059'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000059' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'e2673e67-af64-4ac9-bff4-cdc4911f0cf1', id, 'en', '/media/tpot/6.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000005a'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000005a' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'e7cfc75a-31ac-4cf7-97a1-f08234834c2e', id, 'en', '/media/tpot/7.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000005b'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000005b' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '5db0e9ce-842f-4fe1-8b91-98372726022e', id, 'en', '/media/tpot/8.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000005c'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000005c' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '213c8d90-6185-4e44-92b9-14d05b12bed2', id, 'en', '/media/tpot/9.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000005d'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000005d' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'acf98c2f-f24d-4610-aa20-51e447620482', id, 'en', '/media/tpot/10.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000005e'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000005e' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '24394c47-896a-49f3-aff1-c6855bb0ae87', id, 'en', '/media/tpot/11.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000005f'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000005f' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'f93753a3-6483-4fb9-b33c-e65cf142f965', id, 'en', '/media/tpot/12.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000060'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000060' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '8ef18fdf-47e1-47ac-9419-baf671f613fb', id, 'en', '/media/tpot/13.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000061'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000061' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '3662d76c-fe7b-4d10-a01b-c68974a8f3e0', id, 'en', '/media/tpot/14.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000062'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000062' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'f9c6b75d-d4fb-448d-bc3d-0356c04390ee', id, 'en', '/media/tpot/15.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000063'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000063' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a9000549-3bb4-44ac-bc7a-9268de6dddad', id, 'en', '/media/tpot/16.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000064'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000064' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '079574cd-a0ec-4f9b-8c06-9a157cedc007', id, 'en', '/media/tpot/17.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000065'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000065' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '9895984f-1595-4ed4-8a81-dcdccfadcd93', id, 'en', '/media/tpot/18.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000066'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000066' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '927e4543-715a-48c8-8876-360ab7f9e869', id, 'en', '/media/tpot/19.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000067'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000067' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'ff494d5c-a7a9-40da-92e9-37c2e10275a1', id, 'en', '/media/tpot/20.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000068'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000068' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '02378e3d-fe6e-4383-a51c-5e7aef00bbbf', id, 'en', '/media/tpot/21.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000069'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000069' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'a7825402-96b1-4464-86a0-c1202011695d', id, 'en', '/media/tpot/22.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000006a'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000006a' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '0ea1fc45-3952-4d8c-9dae-f63977811c33', id, 'en', '/media/idfb/1.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000006b'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000006b' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '9aa795ea-188f-4ea6-9950-e61524529abd', id, 'en', '/media/bfdie/1.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000006c'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000006c' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '5e5c7c3c-e230-4dc6-9b9e-02a0d00ceeef', id, 'en', '/media/bfdie/2.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000006d'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000006d' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '62ec5750-d239-4923-a93b-3c26abb6bd52', id, 'en', '/media/bfdie/3.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000006e'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000006e' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'e173c545-4c70-4b44-b4b1-d5f6cc77245f', id, 'en', '/media/bfdie/4.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-00000000006f'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-00000000006f' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'eed8c9fb-060d-407c-a792-952032701d38', id, 'en', '/media/bfdie/5.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000070'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000070' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '33f4bb35-3c34-4366-a06f-1e43f075f608', id, 'en', '/media/bfdie/6.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000071'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000071' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '2818ca06-35e2-487f-9d8e-53a7d82c4f8b', id, 'en', '/media/bfdie/7.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000072'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000072' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT 'f6ee4254-ac8b-42ae-9a25-1c66d84ecf18', id, 'en', '/media/bfdie/8.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000073'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000073' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '1a6a9647-b3a0-446c-8acd-3d90ee501332', id, 'en', '/media/bfdie/9.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000074'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000074' AND language = 'en');

INSERT OR IGNORE INTO subtitles (id, episode_id, language, url)
SELECT '31779603-9bd9-432b-923c-a680400a198a', id, 'en', '/media/bfdie/10.ass'
FROM episodes
WHERE id = '30000000-0000-4000-8000-000000000075'
  AND NOT EXISTS (SELECT 1 FROM subtitles WHERE episode_id = '30000000-0000-4000-8000-000000000075' AND language = 'en');

