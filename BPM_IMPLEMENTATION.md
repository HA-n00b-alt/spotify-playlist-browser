# BPM Detection Implementation

## Overview

This implementation provides a reliable BPM detection pipeline that:
- Uses Spotify only for track identification (metadata + ISRC)
- Sources audio previews from multiple providers (Spotify, iTunes, Deezer)
- Calls an external BPM detection service (Google Cloud Run) to compute BPM
- Caches results in Neon Postgres to avoid recomputation
- Does NOT use Spotify Audio Features/Analysis (restricted since Nov 2024)

## Architecture

### Database

- **Table**: `track_bpm_cache` in Neon Postgres database `song-bpm-storage`
- **Primary Key**: `spotify_track_id` (unique)
- **Cache Key**: `isrc` (when available) for cross-platform matching
- **TTL**: 90 days (cached results are valid for 90 days)

### Components

1. **`lib/db.ts`** - Database connection utility
   - Uses `@neondatabase/serverless` for Edge runtime compatibility
   - Falls back to `pg` Pool for Node runtime (migrations)

2. **`lib/bpm.ts`** - BPM detection module
   - `getBpmForSpotifyTrack(spotifyTrackId)` - Main entry point
   - Extracts identifiers (ISRC, title, artists, preview URL)
   - Checks cache first
   - Resolves preview URL from multiple sources
   - Calls external BPM service (Google Cloud Run) with preview URL
   - Stores results in cache

3. **`app/api/bpm/route.ts`** - API endpoint
   - `GET /api/bpm?spotifyTrackId=...`
   - Returns `{ bpm, source, isrc, bpmRaw }`

4. **UI Integration** - `app/playlists/[id]/page.tsx`
   - Fetches BPM for tracks in batches
   - Displays BPM in track table
   - Supports BPM filtering and sorting

## Preview URL Resolution Order

1. **Spotify preview** (`spotify_preview`) - If `track.preview_url` exists
2. **iTunes ISRC lookup** (`itunes_isrc`) - Lookup by ISRC code
3. **iTunes search** (`itunes_search`) - Search by artist + title
4. **Deezer search** (`deezer`) - Search by artist + title
5. **Failed** (`computed_failed`) - No preview found

## BPM Computation

The BPM computation is handled by an external microservice hosted on Google Cloud Run:
- **Service URL**: `https://bpm-service-340051416180.europe-west3.run.app`
- **Authentication**: Google Cloud IAM Identity Tokens
- **Processing**: Uses Essentia (RhythmExtractor2013) and ffmpeg for accurate BPM detection
- **Response**: Returns normalized BPM, raw BPM, confidence score, and source host

The service:
1. Downloads preview audio from the provided URL
2. Converts to mono WAV at 44.1kHz using ffmpeg
3. Uses Essentia's RhythmExtractor2013 algorithm for tempo detection
4. Normalizes BPM (handles half/double time automatically)
5. Returns BPM data with confidence score

See [bpm-finder-api](https://github.com/HA-n00b-alt/bpm-finder-api) for full service documentation.

## Setup

### 1. Install Dependencies

```bash
npm install
```

Required packages:
- `@neondatabase/serverless` - Neon database client
- `pg` - PostgreSQL client (for migrations)
- `google-auth-library` - Google Cloud authentication for BPM service

### 2. Configure Environment Variables

Add to `.env.local`:

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:password@host/database?sslmode=require
BPM_SERVICE_URL=https://bpm-service-340051416180.europe-west3.run.app
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

- `DATABASE_URL` - Neon pooled connection (PgBouncer) for runtime
- `DATABASE_URL_UNPOOLED` - Neon direct connection for migrations
- `BPM_SERVICE_URL` - External BPM service URL (optional, defaults to provided URL)
- `GCP_SERVICE_ACCOUNT_KEY` - Google Cloud service account key JSON (as single-line string) for authenticating with the BPM service

### 3. Run Migration

```bash
psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql
```

### 4. Deploy

The implementation works on Vercel:
- Edge runtime compatible (uses Neon serverless client)
- BPM computation is handled by external Cloud Run service
- No local audio processing or binary dependencies

## Usage

### API

```bash
curl "https://your-domain.com/api/bpm?spotifyTrackId=4wJ5Qq0jBN4ajy7ouZIV1c"
```

Response:
```json
{
  "bpm": 128.5,
  "source": "spotify_preview",
  "isrc": "USAT22409172",
  "bpmRaw": 64.25
}
```

### UI

BPM is automatically fetched and displayed in the tracks table. The first 20 tracks have BPM fetched on page load.

## Performance

- **Cache hit**: < 50ms (database query)
- **Cache miss**: 3-10 seconds (external service processing)
- **Concurrency**: In-flight computations are deduplicated (same track computed once)

## Error Handling

- Failed preview downloads are cached with error message
- Errors have short TTL (retry after 1 day)
- Rate limiting from external APIs is handled gracefully
- Timeouts: 5s for preview URL resolution, 30s for BPM service call
- BPM service errors are logged and cached for retry

## Limitations

- BPM detection accuracy depends on audio quality and preview length
- Some tracks may not have previews available from any source
- Essentia algorithm works best for consistent tempo (pop/EDM)
- Complex time signatures may not be detected accurately
- Requires Google Cloud service account for authentication

## Future Improvements

- Implement batch BPM fetching for better UX
- Add manual BPM correction interface
- Support for more preview sources
- Better error recovery and retry logic
- Caching of identity tokens to reduce authentication overhead

