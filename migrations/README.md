# Database Migrations

## Running Migrations

To run migrations:

### Option 1: Using environment variable (if already set)

```bash
# From the project root directory
psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql
psql $DATABASE_URL_UNPOOLED -f migrations/002_create_analytics_tables.sql
psql $DATABASE_URL_UNPOOLED -f migrations/003_add_url_tracking.sql
```

### Option 2: Set the connection string manually

```bash
# Set your Neon unpooled connection string
export DATABASE_URL_UNPOOLED="postgresql://user:password@host/database?sslmode=require"

# Run the migrations
psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql
psql $DATABASE_URL_UNPOOLED -f migrations/002_create_analytics_tables.sql
psql $DATABASE_URL_UNPOOLED -f migrations/003_add_url_tracking.sql
```

### Option 3: Using .env.local file

If you have a `.env.local` file with `DATABASE_URL_UNPOOLED`, you can source it first:

```bash
# Load environment variables from .env.local
export $(cat .env.local | grep DATABASE_URL_UNPOOLED | xargs)

# Run the migration
psql $DATABASE_URL_UNPOOLED -f migrations/002_create_analytics_tables.sql
```

**Note:** You need `psql` installed on your system. On macOS, you can install it via Homebrew: `brew install postgresql`

## Migration Files

- `001_create_track_bpm_cache.sql` - Creates the `track_bpm_cache` table for storing BPM values
- `002_create_analytics_tables.sql` - Creates analytics tables for tracking usage statistics (users, pageviews, API requests)
- `003_add_url_tracking.sql` - Adds URL tracking columns (`urls_tried`, `successful_url`) to `track_bpm_cache` table

## Table Schema

The `track_bpm_cache` table stores:
- `isrc` - International Standard Recording Code (unique, nullable)
- `spotify_track_id` - Spotify track ID (unique, indexed)
- `artist` - Artist name(s)
- `title` - Track title
- `bpm` - Normalized BPM value (1 decimal place)
- `bpm_raw` - Raw BPM value from detection
- `source` - Source of preview URL (itunes_isrc, itunes_search, deezer, computed_failed)
- `updated_at` - Timestamp of last update
- `error` - Error message if computation failed (nullable)
- `urls_tried` - JSONB array of URLs that were attempted to find preview audio
- `successful_url` - URL that successfully provided preview audio (null if all failed)

