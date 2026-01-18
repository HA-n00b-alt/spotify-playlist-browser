ALTER TABLE credits_cache
  ADD COLUMN IF NOT EXISTS release_date_start DATE,
  ADD COLUMN IF NOT EXISTS release_date_end DATE,
  ADD COLUMN IF NOT EXISTS profile JSONB,
  ADD COLUMN IF NOT EXISTS total_count INTEGER;

DROP INDEX IF EXISTS credits_cache_name_role_unique;

CREATE UNIQUE INDEX IF NOT EXISTS credits_cache_name_role_unique
  ON credits_cache(name, role, release_date_start, release_date_end);

COMMENT ON COLUMN credits_cache.release_date_start IS 'Optional start date filter applied to Muso credits.';
COMMENT ON COLUMN credits_cache.release_date_end IS 'Optional end date filter applied to Muso credits.';
COMMENT ON COLUMN credits_cache.profile IS 'Cached Muso profile summary for the search.';
COMMENT ON COLUMN credits_cache.total_count IS 'Total credit count returned by Muso for the search.';

CREATE TABLE IF NOT EXISTS muso_track_cache (
  muso_track_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  spotify_preview_url TEXT,
  isrcs TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muso_track_cache_isrcs_gin
  ON muso_track_cache USING GIN (isrcs);

COMMENT ON TABLE muso_track_cache IS 'Cached Muso track details to reduce external API calls.';
COMMENT ON COLUMN muso_track_cache.spotify_preview_url IS 'Spotify preview URL from Muso track details.';
COMMENT ON COLUMN muso_track_cache.isrcs IS 'ISRCs associated with the Muso track.';

CREATE TABLE IF NOT EXISTS muso_album_cache (
  muso_album_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE muso_album_cache IS 'Cached Muso album details for later use.';
