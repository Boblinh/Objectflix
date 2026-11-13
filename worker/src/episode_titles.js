

const EPISODE_TITLE_OVERRIDES = {
  "BFDIA 19: Egg": "BFDIA 19: \{1F95A}", 
};

export function displayEpisodeTitle(title) {
  return EPISODE_TITLE_OVERRIDES[title] ?? title;
}
