-- Migration: Add Essentia and Librosa fields to track_bpm_cache table
-- Run this with: psql $DATABASE_URL_UNPOOLED -f migrations/add_essentia_librosa_fields.sql

-- Rename existing fields to indicate they're from Essentia
ALTER TABLE track_bpm_cache 
  RENAME COLUMN bpm TO bpm_essentia;

ALTER TABLE track_bpm_cache 
  RENAME COLUMN bpm_raw TO bpm_raw_essentia;

ALTER TABLE track_bpm_cache 
  RENAME COLUMN bpm_confidence TO bpm_confidence_essentia;

ALTER TABLE track_bpm_cache 
  RENAME COLUMN key TO key_essentia;

ALTER TABLE track_bpm_cache 
  RENAME COLUMN scale TO scale_essentia;

ALTER TABLE track_bpm_cache 
  RENAME COLUMN key_confidence TO keyscale_confidence_essentia;

-- Add Librosa fields (all nullable)
ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS bpm_librosa NUMERIC(5, 1);

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS bpm_raw_librosa NUMERIC(5, 1);

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS bpm_confidence_librosa NUMERIC(5, 2);

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS key_librosa TEXT;

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS scale_librosa TEXT;

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS keyscale_confidence_librosa NUMERIC(5, 2);

-- Add fields for selected values (which method was chosen)
ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS bpm_selected TEXT DEFAULT 'essentia'; -- 'essentia', 'librosa', or 'manual'

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS bpm_manual NUMERIC(5, 1);

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS key_selected TEXT DEFAULT 'essentia'; -- 'essentia', 'librosa', or 'manual'

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS key_manual TEXT;

ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS scale_manual TEXT;

-- Add debug_txt field
ALTER TABLE track_bpm_cache 
  ADD COLUMN IF NOT EXISTS debug_txt TEXT;

-- Add comments
COMMENT ON COLUMN track_bpm_cache.bpm_essentia IS 'BPM value from Essentia analysis (normalized, integer)';
COMMENT ON COLUMN track_bpm_cache.bpm_raw_essentia IS 'Raw BPM value from Essentia analysis (before normalization)';
COMMENT ON COLUMN track_bpm_cache.bpm_confidence_essentia IS 'BPM confidence score from Essentia (0-1)';
COMMENT ON COLUMN track_bpm_cache.bpm_librosa IS 'BPM value from Librosa fallback analysis (normalized, integer, null if not used)';
COMMENT ON COLUMN track_bpm_cache.bpm_raw_librosa IS 'Raw BPM value from Librosa fallback analysis (null if not used)';
COMMENT ON COLUMN track_bpm_cache.bpm_confidence_librosa IS 'BPM confidence score from Librosa (0-1, null if not used)';
COMMENT ON COLUMN track_bpm_cache.key_essentia IS 'Musical key from Essentia (e.g., C, D, E)';
COMMENT ON COLUMN track_bpm_cache.scale_essentia IS 'Musical scale from Essentia (major or minor)';
COMMENT ON COLUMN track_bpm_cache.keyscale_confidence_essentia IS 'Key/scale confidence score from Essentia (0-1)';
COMMENT ON COLUMN track_bpm_cache.key_librosa IS 'Musical key from Librosa fallback (null if not used)';
COMMENT ON COLUMN track_bpm_cache.scale_librosa IS 'Musical scale from Librosa fallback (null if not used)';
COMMENT ON COLUMN track_bpm_cache.keyscale_confidence_librosa IS 'Key/scale confidence score from Librosa (0-1, null if not used)';
COMMENT ON COLUMN track_bpm_cache.bpm_selected IS 'Which BPM value is selected: essentia, librosa, or manual';
COMMENT ON COLUMN track_bpm_cache.bpm_manual IS 'Manually overridden BPM value';
COMMENT ON COLUMN track_bpm_cache.key_selected IS 'Which key/scale value is selected: essentia, librosa, or manual';
COMMENT ON COLUMN track_bpm_cache.key_manual IS 'Manually overridden key value';
COMMENT ON COLUMN track_bpm_cache.scale_manual IS 'Manually overridden scale value';
COMMENT ON COLUMN track_bpm_cache.debug_txt IS 'Debug information from BPM service';

