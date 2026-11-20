CREATE TABLE IF NOT EXISTS episode_reviews (
	id TEXT PRIMARY KEY,
	episode_id TEXT NOT NULL,
	rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
	body TEXT NOT NULL,
	author_name TEXT NOT NULL,
	author_type TEXT NOT NULL DEFAULT 'guest' CHECK (author_type IN ('guest', 'account')),
	user_id TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episode_reviews_episode ON episode_reviews (episode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episode_reviews_created ON episode_reviews (created_at DESC);