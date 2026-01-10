-- Database Setup Script
-- Run this with: psql $DATABASE_URL_UNPOOLED -f setup.sql
-- This script creates all required tables for a fresh installation

-- ============================================================================
-- BPM Cache Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS track_bpm_cache (
  id SERIAL PRIMARY KEY,
  spotify_track_id VARCHAR(255) NOT NULL,
  isrc VARCHAR(12), -- International Standard Recording Code from Spotify
  artist TEXT,
  title TEXT,
  bpm_essentia NUMERIC(5, 1), -- BPM value from Essentia analysis (normalized, integer)
  bpm_raw_essentia NUMERIC(5, 1), -- Raw BPM value from Essentia analysis (before normalization)
  bpm_confidence_essentia NUMERIC(5, 2), -- BPM confidence score from Essentia (0-1)
  bpm_librosa NUMERIC(5, 1), -- BPM value from Librosa fallback analysis (normalized, integer, null if not used)
  bpm_raw_librosa NUMERIC(5, 1), -- Raw BPM value from Librosa fallback analysis (null if not used)
  bpm_confidence_librosa NUMERIC(5, 2), -- BPM confidence score from Librosa (0-1, null if not used)
  key_essentia TEXT, -- Musical key from Essentia (e.g., C, D, E)
  scale_essentia TEXT, -- Musical scale from Essentia (major or minor)
  keyscale_confidence_essentia NUMERIC(5, 2), -- Key/scale confidence score from Essentia (0-1)
  key_librosa TEXT, -- Musical key from Librosa fallback (null if not used)
  scale_librosa TEXT, -- Musical scale from Librosa fallback (null if not used)
  keyscale_confidence_librosa NUMERIC(5, 2), -- Key/scale confidence score from Librosa (0-1, null if not used)
  bpm_selected TEXT DEFAULT 'essentia', -- Which BPM value is selected: essentia, librosa, or manual
  bpm_manual NUMERIC(5, 1), -- Manually overridden BPM value
  key_selected TEXT DEFAULT 'essentia', -- Which key/scale value is selected: essentia, librosa, or manual
  key_manual TEXT, -- Manually overridden key value
  scale_manual TEXT, -- Manually overridden scale value
  source TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error TEXT,
  urls JSONB, -- Array of preview URLs with success flag
  isrc_mismatch BOOLEAN DEFAULT FALSE, -- True when ISRC from search results doesn't match Spotify ISRC
  debug_txt TEXT, -- Debug information from BPM service
  CONSTRAINT unique_spotify_track UNIQUE (spotify_track_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_spotify_id ON track_bpm_cache(spotify_track_id);
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_isrc ON track_bpm_cache(isrc) WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_bpm_cache_updated_at ON track_bpm_cache(updated_at);

COMMENT ON TABLE track_bpm_cache IS 'Cache for BPM values computed from audio previews. Source can be: deezer_isrc, itunes_search, deezer_search, computed_failed';
COMMENT ON COLUMN track_bpm_cache.isrc IS 'International Standard Recording Code from Spotify, used for cross-platform track matching';
COMMENT ON COLUMN track_bpm_cache.urls IS 'Array of preview URLs with success flag';
COMMENT ON COLUMN track_bpm_cache.isrc_mismatch IS 'True when ISRC from iTunes/Deezer search results does not match Spotify ISRC, may affect BPM accuracy';
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

-- ============================================================================
-- Admin Users Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  spotify_user_id VARCHAR(255) PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE admin_users IS 'Spotify user IDs allowed to access admin features';

-- ============================================================================
-- Admin Access Requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_access_requests (
  id SERIAL PRIMARY KEY,
  spotify_user_id VARCHAR(255) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_admin_access_requests_status ON admin_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_admin_access_requests_user ON admin_access_requests(spotify_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS admin_access_requests_pending_unique
  ON admin_access_requests(spotify_user_id)
  WHERE status = 'pending';

COMMENT ON TABLE admin_access_requests IS 'Queue of admin access requests awaiting super admin approval';
