-- Create spotify access request queue
CREATE TABLE IF NOT EXISTS spotify_access_requests (
  id SERIAL PRIMARY KEY,
  spotify_user_id VARCHAR(255) NOT NULL,
  display_name TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_spotify_access_requests_status ON spotify_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_spotify_access_requests_user ON spotify_access_requests(spotify_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS spotify_access_requests_pending_unique
  ON spotify_access_requests(spotify_user_id)
  WHERE status = 'pending';

COMMENT ON TABLE spotify_access_requests IS 'Queue of Spotify API access requests awaiting manual approval.';
