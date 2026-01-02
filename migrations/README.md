# Database Migrations

## Running Migrations

To run the migration for the `track_bpm_cache` table:

```bash
# Using psql with the unpooled connection string
psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql
```

Or manually:

```bash
# Set your Neon unpooled connection string
export DATABASE_URL_UNPOOLED="postgresql://user:password@host/database?sslmode=require"

# Run the migration
psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql
```

## Migration Files

- `001_create_track_bpm_cache.sql` - Creates the `track_bpm_cache` table for storing BPM values

## Table Schema

The `track_bpm_cache` table stores:
- `isrc` - International Standard Recording Code (unique, nullable)
- `spotify_track_id` - Spotify track ID (unique, indexed)
- `artist` - Artist name(s)
- `title` - Track title
- `bpm` - Normalized BPM value (1 decimal place)
- `bpm_raw` - Raw BPM value from detection
- `source` - Source of preview URL (spotify_preview, itunes_isrc, itunes_search, deezer, computed_failed)
- `updated_at` - Timestamp of last update
- `error` - Error message if computation failed (nullable)

