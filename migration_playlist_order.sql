-- Migration: Add playlist_order table
-- Run this with: psql $DATABASE_URL_UNPOOLED -f migration_playlist_order.sql
-- This migration adds playlist ordering functionality to persist custom order across devices

-- ============================================================================
-- Playlist Order Table
-- ============================================================================

-- Table to store custom playlist order for each user
CREATE TABLE IF NOT EXISTS playlist_order (
  id SERIAL PRIMARY KEY,
  spotify_user_id VARCHAR(255) NOT NULL,
  playlist_id VARCHAR(255) NOT NULL,
  display_order INTEGER NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_playlist_order UNIQUE (spotify_user_id, playlist_id)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_playlist_order_user_id ON playlist_order(spotify_user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_order_display_order ON playlist_order(spotify_user_id, display_order);
CREATE INDEX IF NOT EXISTS idx_playlist_order_playlist_id ON playlist_order(playlist_id);

COMMENT ON TABLE playlist_order IS 'Stores custom display order for playlists per user';
COMMENT ON COLUMN playlist_order.spotify_user_id IS 'Spotify user ID to identify the user';
COMMENT ON COLUMN playlist_order.playlist_id IS 'Spotify playlist ID';
COMMENT ON COLUMN playlist_order.display_order IS 'Custom display order (lower numbers appear first)';


