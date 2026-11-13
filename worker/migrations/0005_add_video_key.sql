-- Migration 0005: add B2 object key column to episodes
-- video_key stores the actual B2 object key/path of the uploaded video.
-- Left NULL until the user provides exact keys after uploading to B2.
ALTER TABLE episodes ADD COLUMN video_key TEXT;
