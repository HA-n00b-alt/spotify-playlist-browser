-- Migration: Add URL tracking columns to track_bpm_cache
-- Run this with: psql $DATABASE_URL_UNPOOLED -f migrations/003_add_url_tracking.sql

-- Add columns for tracking URLs tried and successful URL
ALTER TABLE track_bpm_cache 
ADD COLUMN IF NOT EXISTS urls_tried JSONB,
ADD COLUMN IF NOT EXISTS successful_url TEXT;

-- Add comment
COMMENT ON COLUMN track_bpm_cache.urls_tried IS 'Array of URLs that were attempted to find preview audio';
COMMENT ON COLUMN track_bpm_cache.successful_url IS 'URL that successfully provided preview audio (null if all failed)';

