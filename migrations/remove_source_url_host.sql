-- Migration: Remove source_url_host column from track_bpm_cache table
-- Run this with: psql $DATABASE_URL_UNPOOLED -f migrations/remove_source_url_host.sql

-- Remove source_url_host column
ALTER TABLE track_bpm_cache 
  DROP COLUMN IF EXISTS source_url_host;

