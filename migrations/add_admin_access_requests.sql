-- Create admin access request queue
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
