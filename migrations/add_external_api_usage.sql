CREATE TABLE IF NOT EXISTS external_api_usage (
  provider TEXT NOT NULL,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (provider, usage_date)
);

COMMENT ON TABLE external_api_usage IS 'Daily usage counters for external APIs such as Muso.';
