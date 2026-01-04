-- Migration: Remove isrc column from track_bpm_cache
-- Reason: Column is always null (Spotify API doesn't consistently provide UPCs)
-- Date: 2024

-- Drop the index first (it references the column)
DROP INDEX IF EXISTS idx_track_bpm_cache_isrc;

-- Drop the column
ALTER TABLE track_bpm_cache DROP COLUMN IF EXISTS isrc;

