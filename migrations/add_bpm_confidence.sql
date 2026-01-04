-- Migration: Add bpm_confidence column to track_bpm_cache table
-- Run this with: psql $DATABASE_URL_UNPOOLED -f migrations/add_bpm_confidence.sql

-- Add bpm_confidence column if it doesn't exist
ALTER TABLE track_bpm_cache 
ADD COLUMN IF NOT EXISTS bpm_confidence NUMERIC(5, 2);

-- Add comment
COMMENT ON COLUMN track_bpm_cache.bpm_confidence IS 'Confidence score for BPM detection (0-1)';

