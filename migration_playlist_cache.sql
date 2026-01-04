-- Migration: Add playlist_cache table
-- Run this with: psql $DATABASE_URL_UNPOOLED -f migration_playlist_cache.sql
-- This migration adds playlist caching functionality to reduce Spotify API calls

-- ============================================================================
-- Playlist Cache Table
-- ============================================================================

-- Table to cache playlist data to reduce API calls
CREATE TABLE IF NOT EXISTS playlist_cache (
  id SERIAL PRIMARY KEY,
  playlist_id VARCHAR(255) NOT NULL UNIQUE,
  snapshot_id VARCHAR(255) NOT NULL,
  playlist_data JSONB NOT NULL, -- Full playlist data from Spotify API
  tracks_data JSONB NOT NULL, -- Full tracks data from Spotify API
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_playlist_id UNIQUE (playlist_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_playlist_cache_playlist_id ON playlist_cache(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_cache_snapshot_id ON playlist_cache(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_playlist_cache_updated_at ON playlist_cache(updated_at);

COMMENT ON TABLE playlist_cache IS 'Cache for playlist data to reduce Spotify API calls. Uses snapshot_id to detect changes.';
COMMENT ON COLUMN playlist_cache.snapshot_id IS 'Spotify snapshot_id that corresponds to the version of the playlist';
COMMENT ON COLUMN playlist_cache.playlist_data IS 'Full playlist metadata from Spotify API';
COMMENT ON COLUMN playlist_cache.tracks_data IS 'Full tracks array from Spotify API';



