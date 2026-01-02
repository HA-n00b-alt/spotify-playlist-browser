-- Database Setup Script
-- Run this with: psql $DATABASE_URL_UNPOOLED -f setup.sql
-- This script creates all required tables for a fresh installation

-- ============================================================================
-- BPM Cache Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS track_bpm_cache (
  id SERIAL PRIMARY KEY,
  isrc VARCHAR(12) UNIQUE, -- Note: Stores UPC values (kept as isrc for backward compatibility)
  spotify_track_id VARCHAR(255) NOT NULL,
  artist TEXT,
  title TEXT,
  bpm NUMERIC(5, 1),
  bpm_raw NUMERIC(5, 1),
  source TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error TEXT,
  urls_tried JSONB, -- Array of URLs that were attempted to find preview audio
  successful_url TEXT, -- URL that successfully provided preview audio (null if all failed)
  CONSTRAINT unique_spotify_track UNIQUE (spotify_track_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_isrc ON track_bpm_cache(isrc) WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_spotify_id ON track_bpm_cache(spotify_track_id);
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_updated_at ON track_bpm_cache(updated_at);

COMMENT ON TABLE track_bpm_cache IS 'Cache for BPM values computed from audio previews. Source can be: itunes_upc, itunes_search, deezer_upc, deezer, computed_failed';
COMMENT ON COLUMN track_bpm_cache.isrc IS 'Stores UPC (Universal Product Code) values for album identification';
COMMENT ON COLUMN track_bpm_cache.urls_tried IS 'Array of URLs that were attempted to find preview audio';
COMMENT ON COLUMN track_bpm_cache.successful_url IS 'URL that successfully provided preview audio (null if all failed)';

-- ============================================================================
-- Analytics Tables
-- ============================================================================

-- Table to track unique users (by Spotify user ID)
CREATE TABLE IF NOT EXISTS analytics_users (
  id SERIAL PRIMARY KEY,
  spotify_user_id VARCHAR(255) UNIQUE NOT NULL,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_pageviews INTEGER DEFAULT 0,
  total_api_requests INTEGER DEFAULT 0
);

-- Table to track pageviews
CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id SERIAL PRIMARY KEY,
  spotify_user_id VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table to track API requests
CREATE TABLE IF NOT EXISTS analytics_api_requests (
  id SERIAL PRIMARY KEY,
  spotify_user_id VARCHAR(255),
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_analytics_users_spotify_id ON analytics_users(spotify_user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_user_id ON analytics_pageviews(spotify_user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_created_at ON analytics_pageviews(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_path ON analytics_pageviews(path);
CREATE INDEX IF NOT EXISTS idx_analytics_api_requests_user_id ON analytics_api_requests(spotify_user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_api_requests_created_at ON analytics_api_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_api_requests_endpoint ON analytics_api_requests(endpoint);

-- Add comments
COMMENT ON TABLE analytics_users IS 'Tracks unique users and their aggregate statistics';
COMMENT ON TABLE analytics_pageviews IS 'Tracks individual page views';
COMMENT ON TABLE analytics_api_requests IS 'Tracks API endpoint requests';

