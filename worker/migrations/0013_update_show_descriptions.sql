-- Objectflix seed data
-- Migration 0013: Replace placeholder show descriptions with detailed,
-- spoiler-free synopses researched from public sources (Wikipedia, BFDI wiki).

UPDATE shows SET description =
'It all starts right here. In the grasslands of Goiky, twenty anthropomorphic objects are living their usual lives until the Announcer — a mysterious speaker box — falls from the sky and reveals Dream Island: a luxurious paradise that only one of them can own. Split into the Squishy Cherries and the Squashy Grapes, the contestants face off in monthly challenges where losing means facing Cake at Stake, and the viewers themselves vote who gets sent to the Tiny Loser Chamber. Created by Cary and Michael Huang, this is the 25-episode season that launched an entire genre — complete with recovery centers, alliances, betrayals, and deaths that never quite stick.'
WHERE id = '10000000-0000-4000-8000-000000000001'; -- BFDI

UPDATE shows SET description =
'Dream Island has been won — but nobody actually owns it. So 22 objects return for round two: twelve veterans joined by ten newcomers chosen entirely by fan vote. This season throws out the rulebook — contestants can switch teams whenever they want, challenges are decided by spinning a wheel, the most-liked contestant each round spins for a prize, and the host changes from episode to episode. With Team No-Name and W.O.A.H. Bunch battling it out and viewers voting by likes and dislikes, BFDIA is the series at its most chaotic and unpredictable. Originally released from 2012, the season went on a decade-long hiatus before finally returning in 2023 to finish what it started.'
WHERE id = '10000000-0000-4000-8000-000000000002'; -- BFDIA

UPDATE shows SET description =
'Sixty-four objects. Eight teams of eight. The biggest season ever made. When two creatures known as Algebraliens — Four and X — arrive on Earth offering "a BFDI" as the grand prize, the largest cast in series history is thrown into a whirlwind of challenges, screeches, and jawbreakers. Four can recover dead contestants with a snap of his fingers, eliminations come fast and frequent, and with a cast this big, anyone can become a fan favorite overnight. But midway through the season, everything changes when a brand-new number shows up uninvited — and half the cast decides to follow it.'
WHERE id = '10000000-0000-4000-8000-000000000003'; -- BFB

UPDATE shows SET description =
'The Power of Two begins where BFB splits: forty contestants have abandoned Four''s game for the chance to win something bigger — limitless power, granted by the green Algebralien Two. Divided into six teams of seven and judged by a vote-to-save format, the contestants battle through bigger, longer, and more cinematic challenges than ever before. But beneath the comedy, something darker is stirring. As the season unfolds, long-buried secrets about the Algebraliens begin surfacing — and the contestants learn that some deals come at a price. The most ambitious and story-driven season of Battle for Dream Island yet.'
WHERE id = '10000000-0000-4000-8000-000000000004'; -- TPOT

UPDATE shows SET description =
'No challenges. No eliminations. No competition at all. Three years after BFDIA, the contestants have somehow ended up in Yoyleland, where they live out slice-of-life misadventures far from any game show. For the first time in series history, viewers vote on who gets released from the Tiny Loser Chamber rather than who enters it. With only a single episode ever released, IDFB remains the shortest — and strangest — chapter in the Battle for Dream Island saga.'
WHERE id = '10000000-0000-4000-8000-000000000005'; -- IDFB

UPDATE shows SET description =
'While Season 1 rages on in the spotlight, the Announcer is quietly running a game of his own — somewhere else in Goiky. Twelve brand-new contestants, plus one very familiar face, compete without teams for the grand prize: Nightmare Island, a twisted opposite of Dream Island whose winner alone decides who gets trapped there. With no viewer-voted eliminations — last place in each challenge goes home immediately — every contestant is only as safe as their next performance. Released weekly in bite-sized episodes, this 2026 midquel runs in secret parallel to the original season and proves the Announcer never could resist hosting just one more game.'
WHERE id = '10000000-0000-4000-8000-000000000006'; -- BFDIE
