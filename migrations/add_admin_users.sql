-- Create admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  spotify_user_id VARCHAR(255) PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial admin
INSERT INTO admin_users (spotify_user_id, active)
VALUES ('delman-it', TRUE)
ON CONFLICT (spotify_user_id) DO NOTHING;
