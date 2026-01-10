CREATE TABLE IF NOT EXISTS credits_cache (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  results JSONB NOT NULL,
  isrcs TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS credits_cache_name_role_unique
  ON credits_cache(name, role);

CREATE INDEX IF NOT EXISTS credits_cache_isrcs_gin
  ON credits_cache USING GIN (isrcs);

COMMENT ON TABLE credits_cache IS 'Cached credit search results (MusicBrainz + Deezer)';
