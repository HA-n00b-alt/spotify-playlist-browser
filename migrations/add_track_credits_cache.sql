CREATE TABLE IF NOT EXISTS track_credits_cache (
  isrc TEXT PRIMARY KEY,
  credits JSONB NOT NULL,
  source TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE track_credits_cache IS 'Cached per-track credits for playlist view (Muso first, MusicBrainz fallback).';
