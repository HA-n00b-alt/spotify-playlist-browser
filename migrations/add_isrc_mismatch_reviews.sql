ALTER TABLE track_bpm_cache
  ADD COLUMN IF NOT EXISTS isrc_mismatch_review_status TEXT,
  ADD COLUMN IF NOT EXISTS isrc_mismatch_reviewed_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS isrc_mismatch_reviewed_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN track_bpm_cache.isrc_mismatch_review_status IS 'Admin review status for ISRC mismatch: mismatch or match';
COMMENT ON COLUMN track_bpm_cache.isrc_mismatch_reviewed_by IS 'Spotify user ID of the reviewer';
COMMENT ON COLUMN track_bpm_cache.isrc_mismatch_reviewed_at IS 'Timestamp when ISRC mismatch review was recorded';
