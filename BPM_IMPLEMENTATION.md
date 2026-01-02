# BPM Detection Implementation

## Overview

This implementation provides a reliable BPM detection pipeline that:
- Uses Spotify only for track identification (metadata + ISRC)
- Sources audio previews from multiple providers (Spotify, iTunes, Deezer)
- Computes BPM from audio previews using autocorrelation
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
   - Downloads and converts audio
   - Computes BPM using autocorrelation
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

1. Download preview audio (typically 30 seconds)
2. Convert to mono WAV at 44.1kHz using ffmpeg
3. Apply high-pass filter to emphasize beats
4. Use autocorrelation to detect tempo
5. Normalize BPM (handle half/double time):
   - While BPM < 70: multiply by 2
   - While BPM > 200: divide by 2
6. Round to 1 decimal place
7. Store both raw and normalized BPM

## Setup

### 1. Install Dependencies

```bash
npm install
```

Required packages:
- `@neondatabase/serverless` - Neon database client
- `pg` - PostgreSQL client (for migrations)
- `ffmpeg-static` - Static ffmpeg binary
- `web-audio-beat-detector` - (optional, not currently used)

### 2. Configure Environment Variables

Add to `.env.local`:

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:password@host/database?sslmode=require
```

- `DATABASE_URL` - Neon pooled connection (PgBouncer) for runtime
- `DATABASE_URL_UNPOOLED` - Neon direct connection for migrations

### 3. Run Migration

```bash
psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql
```

### 4. Deploy

The implementation works on Vercel:
- Edge runtime compatible (uses Neon serverless client)
- ffmpeg-static works on Vercel's serverless functions
- Audio processing happens in `/tmp` (cleaned up after)

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
- **Cache miss**: 5-15 seconds (download + compute)
- **Concurrency**: In-flight computations are deduplicated (same track computed once)

## Error Handling

- Failed preview downloads are cached with error message
- Errors have short TTL (retry after 1 day)
- Rate limiting from external APIs is handled gracefully
- Timeouts: 5s for preview URL resolution, 10s for audio download

## Limitations

- BPM detection accuracy depends on audio quality and preview length
- Some tracks may not have previews available from any source
- Autocorrelation algorithm works best for consistent tempo (pop/EDM)
- Complex time signatures may not be detected accurately

## Future Improvements

- Use more robust BPM detection library (e.g., Essentia.js)
- Implement batch BPM fetching for better UX
- Add manual BPM correction interface
- Support for more preview sources
- Better error recovery and retry logic

