CREATE TABLE IF NOT EXISTS profiles (
	id TEXT PRIMARY KEY,
	account TEXT NOT NULL,
	name TEXT NOT NULL,
	avatar TEXT NOT NULL,
	class_name TEXT NOT NULL DEFAULT 'profile-avatar--gradient-a',
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles (account, created_at);
