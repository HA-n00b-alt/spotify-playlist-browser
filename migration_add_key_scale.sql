-- Migration: Add key, scale, and key_confidence columns to track_bpm_cache
-- Reason: Store musical key and scale information from BPM service
-- Date: 2024

-- Add key column (musical key, e.g., "C", "D", "E", etc.)
ALTER TABLE track_bpm_cache 
ADD COLUMN IF NOT EXISTS key TEXT;

-- Add scale column (musical scale, e.g., "major", "minor", etc.)
ALTER TABLE track_bpm_cache 
ADD COLUMN IF NOT EXISTS scale TEXT;

-- Add key_confidence column (confidence score for key detection, 0-1)
ALTER TABLE track_bpm_cache 
ADD COLUMN IF NOT EXISTS key_confidence NUMERIC(5, 2);

-- Add comments
COMMENT ON COLUMN track_bpm_cache.key IS 'Musical key detected by BPM service (e.g., C, D, E)';
COMMENT ON COLUMN track_bpm_cache.scale IS 'Musical scale detected by BPM service (e.g., major, minor)';
COMMENT ON COLUMN track_bpm_cache.key_confidence IS 'Confidence score for key detection (0-1)';

