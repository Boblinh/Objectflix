ALTER TABLE subtitles ADD COLUMN attribution TEXT;
ALTER TABLE subtitles ADD COLUMN workshop_submission_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitles_workshop_submission
  ON subtitles (workshop_submission_id) WHERE workshop_submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS subtitle_reports (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  subtitle_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('typo', 'timing', 'missing', 'other')),
  time_seconds INTEGER,
  direction TEXT CHECK (direction IN ('early', 'late')),
  details TEXT NOT NULL,
  corrected_text TEXT,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  resolution TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  FOREIGN KEY (subtitle_id) REFERENCES subtitles(id)
);
CREATE INDEX IF NOT EXISTS idx_subtitle_reports_status_created
  ON subtitle_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subtitle_reports_episode
  ON subtitle_reports (episode_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subtitle_workshop_submissions (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  language TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('ass', 'ssa')),
  attribution TEXT NOT NULL,
  rights_confirmed INTEGER NOT NULL CHECK (rights_confirmed = 1),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  FOREIGN KEY (episode_id) REFERENCES episodes(id)
);
CREATE INDEX IF NOT EXISTS idx_subtitle_workshop_status_created
  ON subtitle_workshop_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subtitle_workshop_user
  ON subtitle_workshop_submissions (user_id, created_at DESC);
