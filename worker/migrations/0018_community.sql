CREATE TABLE IF NOT EXISTS community_requests (
	id TEXT PRIMARY KEY,
	type TEXT NOT NULL CHECK (type IN ('show', 'episode')),
	title TEXT NOT NULL,
	episode_number TEXT,
	link TEXT,
	notes TEXT,
	requested_by TEXT,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_requests_created ON community_requests (created_at DESC);

CREATE TABLE IF NOT EXISTS community_feedback (
	id TEXT PRIMARY KEY,
	rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
	category TEXT NOT NULL DEFAULT 'General',
	discord TEXT,
	message TEXT NOT NULL,
	sent_by TEXT,
	status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_feedback_created ON community_feedback (created_at DESC);
