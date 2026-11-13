-- Objectflix seed data
-- Migration 0013: Replace placeholder show descriptions with detailed,
-- spoiler-free synopses researched from public sources (Wikipedia, BFDI wiki).

UPDATE shows SET description =
'Twenty contestants compete in challenges to win Dream Island. The viewers vote on who gets eliminated.'
WHERE id = '10000000-0000-4000-8000-000000000001'; -- BFDI

UPDATE shows SET description =
'Contestants return for a chaotic second season. Teams are fan-chosen, challenges are decided by spinning wheels, and the game keeps changing.'
WHERE id = '10000000-0000-4000-8000-000000000002'; -- BFDIA

UPDATE shows SET description =
'Sixty-four contestants in eight teams compete for "a BFDI." Eliminations are fast — and a new number arrives to shake things up.'
WHERE id = '10000000-0000-4000-8000-000000000003'; -- BFB

UPDATE shows SET description =
'Forty contestants chase a power-granting Algebralien across the biggest, most cinematic season yet. Bigger stakes. Darker secrets. The most ambitious season so far.'
WHERE id = '10000000-0000-4000-8000-000000000004'; -- TPOT

UPDATE shows SET description =
'After BFDIA, the contestants are stranded in Yoyleland with no game to play. Viewers now vote on who gets released from the TLC.'
WHERE id = '10000000-0000-4000-8000-000000000005'; -- IDFB

UPDATE shows SET description =
'A secret midquel in Goiky: twelve new faces compete without teams, judged by last-place eliminations. The Announcer runs a parallel game nobody knows about.'
WHERE id = '10000000-0000-4000-8000-000000000006'; -- BFDIE
