-- Migration: Create track_bpm_cache table
-- Run this with: psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql

CREATE TABLE IF NOT EXISTS track_bpm_cache (
  id SERIAL PRIMARY KEY,
  isrc VARCHAR(12) UNIQUE,
  spotify_track_id VARCHAR(255) NOT NULL,
  artist TEXT,
  title TEXT,
  bpm NUMERIC(5, 1),
  bpm_raw NUMERIC(5, 1),
  source TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error TEXT,
  CONSTRAINT unique_spotify_track UNIQUE (spotify_track_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_isrc ON track_bpm_cache(isrc) WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_spotify_id ON track_bpm_cache(spotify_track_id);
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_updated_at ON track_bpm_cache(updated_at);

-- Add comment
COMMENT ON TABLE track_bpm_cache IS 'Cache for BPM values computed from audio previews. Source can be: spotify_preview, itunes_isrc, itunes_search, deezer, computed_failed';

