-- Clear BPM cache table
-- Run this with: psql $DATABASE_URL_UNPOOLED -f scripts/clear_bpm_cache.sql

-- Delete all records from track_bpm_cache
DELETE FROM track_bpm_cache;

-- Reset the sequence (optional, but good practice)
-- This ensures new IDs start from 1 after clearing
ALTER SEQUENCE track_bpm_cache_id_seq RESTART WITH 1;

-- Show confirmation
SELECT 'BPM cache cleared successfully' AS status;


