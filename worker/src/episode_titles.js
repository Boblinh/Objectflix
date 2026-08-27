// Episode title display overrides.
//
// Some episode titles contain characters that we intentionally do not store
// in the database (e.g. emoji, to keep the seed SQL plain ASCII). This module
// maps the stored title back to the real display title when serving the API.
//
// Stored title                  ->  Displayed title
// "BFDIA 19: Egg"               ->  "BFDIA 19: 🥚"

const EPISODE_TITLE_OVERRIDES = {
  "BFDIA 19: Egg": "BFDIA 19: \u{1F95A}", // 🥚
};

export function displayEpisodeTitle(title) {
  return EPISODE_TITLE_OVERRIDES[title] ?? title;
}
