CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by VARCHAR(255)
);

COMMENT ON TABLE admin_settings IS 'Admin-configurable settings such as monitoring dashboard URLs.';
