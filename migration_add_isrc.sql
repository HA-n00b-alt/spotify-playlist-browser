-- Migration: Add ISRC column and isrc_mismatch flag to track_bpm_cache
-- Reason: Using ISRC for accurate cross-platform track matching
-- Date: 2024

-- Add isrc column (for International Standard Recording Code)
ALTER TABLE track_bpm_cache 
ADD COLUMN IF NOT EXISTS isrc VARCHAR(12);

-- Add index for faster ISRC lookups
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_isrc ON track_bpm_cache(isrc) WHERE isrc IS NOT NULL;

-- Add isrc_mismatch flag to track when ISRC doesn't match (affects BPM accuracy)
ALTER TABLE track_bpm_cache 
ADD COLUMN IF NOT EXISTS isrc_mismatch BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN track_bpm_cache.isrc IS 'International Standard Recording Code from Spotify, used for cross-platform track matching';
COMMENT ON COLUMN track_bpm_cache.isrc_mismatch IS 'True when ISRC from iTunes/Deezer search results does not match Spotify ISRC, may affect BPM accuracy';

