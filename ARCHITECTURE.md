# Architecture Documentation

This document provides a comprehensive technical overview of the Spotify Playlist Tools application architecture, design decisions, and implementation details for engineers working on the codebase.

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Authentication Architecture](#authentication-architecture)
4. [Error Handling System](#error-handling-system)
5. [API Design and Integration](#api-design-and-integration)
6. [Database Architecture](#database-architecture)
7. [Caching Strategy](#caching-strategy)
8. [BPM Service Integration](#bpm-service-integration)
9. [State Management](#state-management)
10. [Logging and Monitoring](#logging-and-monitoring)
11. [Code Organization](#code-organization)
12. [Key Design Decisions](#key-design-decisions)

## System Overview

The application is a Next.js 14 web application that allows users to browse, search, and analyze their Spotify playlists. It integrates with the Spotify Web API, uses a PostgreSQL database for caching and analytics, and calls an external BPM detection service hosted on Google Cloud Run.

### Architecture Diagram

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         │ HTTPS
         │
┌────────▼─────────────────────────────────────┐
│         Next.js Application (Vercel)         │
│  ┌─────────────────────────────────────────┐ │
│  │  Client Components (React + React Query)│ │
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │  API Routes (Server Components)         │ │
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │  Library Functions (lib/)               │ │
│  └─────────────────────────────────────────┘ │
└────────┬───────────────────┬─────────────────┘
         │                   │
         │                   │
    ┌────▼────┐       ┌──────▼──────┐
    │ Spotify │       │   Neon      │
    │   API   │       │ PostgreSQL  │
    └─────────┘       └──────┬──────┘
                             │
                      ┌──────▼──────┐
                      │ Google Cloud│
                      │   Run (BPM) │
                      └─────────────┘
```

## Technology Stack

### Frontend
- **Framework**: Next.js 14.2 (App Router)
- **Language**: TypeScript 5.3+
- **UI Library**: React 18.3
- **Styling**: Tailwind CSS 3.4
- **State Management**: React Query (TanStack Query) 5.90+
- **Build Tool**: Next.js built-in (Webpack)

### Backend
- **Runtime**: Node.js 18+ (Server/Edge)
- **Framework**: Next.js API Routes
- **Database Client**: 
  - `@neondatabase/serverless` (Edge runtime)
  - `pg` (Node runtime for migrations)

### External Services
- **Database**: Neon Postgres (serverless PostgreSQL)
- **Authentication**: Spotify OAuth 2.0 with PKCE
- **BPM Service**: Google Cloud Run (external microservice)
- **Error Tracking**: Sentry
- **Deployment**: Vercel
- **Package Manager**: pnpm

## Authentication Architecture

### OAuth 2.0 Flow with PKCE

The application uses Spotify's OAuth 2.0 with PKCE (Proof Key for Code Exchange) for enhanced security. This prevents authorization code interception attacks.

#### Flow Diagram

```
1. User clicks "Login with Spotify"
   │
   ├─> GET /api/auth/login
   │   ├─> Generate PKCE code_verifier (random 43-128 chars)
   │   ├─> Generate code_challenge (SHA256 hash, base64url)
   │   ├─> Store code_verifier in httpOnly cookie
   │   └─> Redirect to Spotify authorization endpoint
   │
2. User authorizes on Spotify
   │
   └─> Spotify redirects to /api/auth/callback?code=...
       ├─> Retrieve code_verifier from cookie
       ├─> Exchange code + code_verifier for access_token
       ├─> Store access_token in httpOnly cookie (1 hour TTL)
       ├─> Store refresh_token in httpOnly cookie (1 year TTL)
       └─> Redirect to /playlists
```

#### Token Management

- **Access Token**: Short-lived (1 hour), stored in httpOnly cookie
- **Refresh Token**: Long-lived (1 year), stored in httpOnly cookie
- **Automatic Refresh**: Handled in `lib/spotify.ts` when access token expires
- **Cookie Security**:
  - `httpOnly: true` - Not accessible via JavaScript
  - `secure: true` - HTTPS only in production
  - `sameSite: 'lax'` - CSRF protection
  - `path: '/'` - Available site-wide

#### Implementation Details

**Key Files:**
- `app/api/auth/login/route.ts` - Initiates OAuth flow
- `app/api/auth/callback/route.ts` - Handles OAuth callback
- `lib/spotify.ts` - Token refresh logic (`refreshAccessToken()`)
- `lib/spotify.ts` - Token retrieval (`getAccessToken()`)

**Code Example:**
```typescript
// lib/spotify.ts
async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  let token = cookieStore.get('access_token')?.value || null
  
  if (!token) {
    token = await refreshAccessToken()
  }
  
  return token
}
```

## Error Handling System

### Custom Error Classes

The application uses a custom error class hierarchy for type-safe error handling:

**Error Classes** (`lib/errors.ts`):
- `AuthenticationError` - OAuth/auth failures
- `RateLimitError` - Spotify API rate limits (429)
- `NetworkError` - Network/connection failures
- `SpotifyAPIError` - Generic Spotify API errors
- `DatabaseError` - Database operation failures

**Error Structure:**
```typescript
class AuthenticationError extends Error {
  statusCode = 401
  errorType = 'AuthenticationError'
  
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}
```

### Error Handling Flow

1. **Library Layer** (`lib/spotify.ts`, `lib/bpm.ts`):
   - Throws typed errors
   - Logs errors with context
   - Sends errors to Sentry

2. **API Route Layer** (`app/api/**/route.ts`):
   - Catches errors
   - Returns appropriate HTTP status codes
   - Logs errors with component context

3. **UI Layer** (`app/**/page.tsx`):
   - Displays user-friendly error messages
   - Shows retry options for recoverable errors
   - Redirects for authentication errors

### Error Logging and Monitoring

**Centralized Logging** (`lib/logger.ts`):
- `logError()` - Logs errors with context, sends to Sentry
- `logWarning()` - Logs warnings with context
- `logInfo()` - Logs informational messages

**Sentry Integration:**
- Automatic error capture
- Source maps for stack traces
- User context and tags
- Performance monitoring

**Example:**
```typescript
// lib/logger.ts
export function logError(error: Error, context?: LogContext): void {
  console.error(`[${context?.component || 'Unknown'}]`, error.message, context)
  
  if (typeof window === 'undefined' || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: {
        component: context?.component,
        errorType: context?.errorType,
      },
      extra: context,
    })
  }
}
```

### Rate Limiting

**Spotify API Rate Limits:**
- Standard: 300 requests per 30 seconds
- Burst: Higher initial limit

**Implementation** (`lib/spotify.ts`):
- Automatic retry with exponential backoff
- Rate limit detection from 429 responses
- Retry-After header handling
- Dedicated rate limit error page (`app/rate-limit/page.tsx`)

**Code Pattern:**
```typescript
async function makeSpotifyRequest<T>(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<T> {
  try {
    // Make request
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Handle rate limit
      if (retryCount < maxRetries) {
        await delay(retryAfter * 1000)
        return makeSpotifyRequest(endpoint, options, retryCount + 1)
      }
    }
    throw error
  }
}
```

## API Design and Integration

### Spotify API Integration

**Base Client** (`lib/spotify.ts`):
- Centralized request handling
- Automatic token refresh
- Rate limit handling
- Pagination helpers

**Key Functions:**
- `makeSpotifyRequest<T>()` - Generic API request handler
- `paginateSpotify<T>()` - Automatic pagination
- `getPlaylists()` - Fetch user playlists
- `getPlaylist(id)` - Fetch single playlist
- `getPlaylistTracks(id)` - Fetch playlist tracks
- `getTrack(id)` - Fetch track details

**Request Pattern:**
```typescript
async function makeSpotifyRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    throw new AuthenticationError('No access token available')
  }
  
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `https://api.spotify.com/v1${endpoint}`
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  
  // Handle errors, rate limits, etc.
  return response.json()
}
```

### API Routes

**Structure** (`app/api/**/route.ts`):
- RESTful design
- Server-side execution
- Dynamic routes for parameterized endpoints
- Error handling and logging

**Authentication Routes:**
- `GET /api/auth/login` - Initiate OAuth
- `GET /api/auth/callback` - OAuth callback
- `POST /api/auth/logout` - Clear cookies
- `GET /api/auth/status` - Check auth status
- `GET /api/auth/is-admin` - Check admin status

**Playlist Routes:**
- `GET /api/playlists` - List all playlists
- `GET /api/playlists/[id]` - Get playlist details
- `GET /api/playlists/[id]/tracks` - Get playlist tracks

**BPM Routes:**
- `GET /api/bpm?spotifyTrackId=...` - Get BPM for single track
- `POST /api/bpm/batch` - Get BPM for multiple tracks

**Analytics Routes** (Admin only):
- `GET /api/analytics/stats` - Usage statistics
- `POST /api/analytics/track-pageview` - Track pageview

**Utility Routes:**
- `GET /api/country` - Get country code from IP/locale
- `GET /api/audio-proxy` - Proxy audio preview URLs

### API Response Caching

**Client-Side Caching** (React Query):
- Automatic caching of API responses
- Stale-while-revalidate pattern
- Background refetching
- Cache invalidation on mutations

**Server-Side Caching** (Database):
- Playlist data cached in `playlist_cache` table
- BPM data cached in `track_bpm_cache` table
- Cache invalidation via `snapshot_id` (playlists)
- Cache TTL: 90 days (BPM)

## Database Architecture

### Schema Overview

**Tables:**
1. `track_bpm_cache` - BPM, key, scale, and metadata for tracks
2. `playlist_cache` - Cached playlist data
3. `analytics_users` - User statistics
4. `analytics_pageviews` - Page view tracking
5. `analytics_api_requests` - API request tracking
6. `playlist_order` - Custom playlist order (currently unused)

### Database Client

**Dual Runtime Support** (`lib/db.ts`):
- **Edge Runtime**: Uses `@neondatabase/serverless` (Neon SQL client)
- **Node Runtime**: Uses `pg` Pool (for migrations)

**Connection Strings:**
- `DATABASE_URL` - Pooled connection (PgBouncer) for runtime
- `DATABASE_URL_UNPOOLED` - Direct connection for migrations

**Query Helper:**
```typescript
// lib/db.ts
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const sqlClient = neon(DATABASE_URL)
  return sqlClient(text, params || [])
}
```

### Key Tables

#### track_bpm_cache

Stores BPM, key, scale, and related metadata for tracks.

**Key Columns:**
- `spotify_track_id` (PK) - Spotify track ID
- `isrc` - International Standard Recording Code
- `bpm`, `bpm_raw` - BPM values
- `key`, `scale`, `key_confidence` - Musical key information
- `source` - Data source (deezer_isrc, itunes_search, deezer_search, computed_failed)
- `urls` - Preview URL tracking with success flag
- `isrc_mismatch` - Flag for ISRC mismatches

**Indexes:**
- `idx_track_bpm_cache_spotify_id` - Primary lookup
- `idx_track_bpm_cache_isrc` - ISRC lookup
- `idx_track_bpm_cache_updated_at` - Cleanup queries

#### playlist_cache

Caches full playlist data to reduce Spotify API calls.

**Key Columns:**
- `playlist_id` (PK) - Spotify playlist ID
- `snapshot_id` - Spotify snapshot ID (for invalidation)
- `playlist_data` (JSONB) - Full playlist metadata
- `tracks_data` (JSONB) - Full tracks array

**Cache Invalidation:**
- Compares `snapshot_id` with current playlist snapshot
- Automatically refreshes if snapshot changed

## Caching Strategy

### Multi-Level Caching

1. **Browser Cache** (React Query):
   - Client-side API response caching
   - Stale-while-revalidate
   - Automatic background refetching

2. **Database Cache**:
   - Playlist data cached with snapshot_id validation
   - BPM data cached for 90 days
   - Reduces external API calls

3. **HTTP Cache Headers**:
   - Playlists: Cache-Control headers based on snapshot_id
   - BPM: Long-term caching (90 days TTL)

### Cache Invalidation

**Playlist Cache:**
- Invalidated when `snapshot_id` changes
- Manual refresh via `?refresh=true` parameter
- Automatic verification on cache hit

**BPM Cache:**
- 90-day TTL
- Manual refresh via retry button
- Key/scale backfill for missing data

## BPM Service Integration

### Architecture

The BPM detection is handled by an external microservice hosted on Google Cloud Run.

**Service Details:**
- **URL**: `https://bpm-service-340051416180.europe-west3.run.app`
- **Authentication**: Google Cloud IAM Identity Tokens
- **Processing**: Essentia (RhythmExtractor2013) + ffmpeg
- **Input**: Audio preview URL
- **Output**: BPM, raw BPM, key, scale, confidence

### Authentication

**Identity Token Flow** (`lib/bpm.ts`):
1. Parse GCP service account key from env
2. Create GoogleAuth client
3. Generate identity token for Cloud Run service
4. Include token in Authorization header

**Implementation:**
```typescript
async function getIdentityToken(serviceUrl: string): Promise<string> {
  const serviceAccountKeyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
  const serviceAccountKey = JSON.parse(serviceAccountKeyJson)
  
  const auth = new GoogleAuth({
    credentials: serviceAccountKey,
  })
  
  const client = await auth.getIdTokenClient(serviceUrl)
  return client.idTokenProvider.fetchIdToken(serviceUrl)
}
```

### Preview URL Resolution

**Priority Order** (`lib/bpm.ts`):
1. **Deezer ISRC Lookup** (`deezer_isrc`) - Direct ISRC lookup
2. **iTunes Search** (`itunes_search`) - Search with ISRC matching
3. **Deezer Search** (`deezer_search`) - Search fallback
4. **Failed** (`computed_failed`) - No preview found

**ISRC Matching:**
- Extracts ISRC from Spotify track data
- Matches ISRC from search results
- Flags mismatches in `isrc_mismatch` column

### BPM Detection Flow

```
1. Check cache (by ISRC, then by spotify_track_id)
   │
   ├─> Cache hit → Return cached data
   │
   └─> Cache miss → Continue
       │
2. Extract identifiers from Spotify
   ├─> ISRC, title, artists, preview URL
       │
3. Resolve preview URL (Deezer/iTunes)
   ├─> Try Deezer ISRC lookup
   ├─> Try iTunes search + ISRC match
   └─> Try Deezer search
       │
4. Call BPM service
   ├─> Get identity token
   ├─> POST preview URL to service
   └─> Receive BPM, key, scale data
       │
5. Store in cache
   └─> Save to track_bpm_cache table
```

## State Management

### React Query (TanStack Query)

**Provider** (`app/providers/QueryProvider.tsx`):
- Wraps application with QueryClientProvider
- Configured with default options

**Hooks** (`app/hooks/`):
- `usePlaylist(id)` - Fetch playlist data
- `usePlaylistTracks(id)` - Fetch playlist tracks
- `useRefreshPlaylist(id)` - Manual refresh
- `useRefreshPlaylistTracks(id)` - Manual refresh

**Cache Configuration:**
- Default stale time: 30 seconds
- Default cache time: 5 minutes
- Automatic background refetching
- Optimistic updates for mutations

**Example:**
```typescript
// app/hooks/usePlaylist.ts
export function usePlaylist(playlistId: string) {
  return useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () => fetch(`/api/playlists/${playlistId}`).then(res => res.json()),
    staleTime: 30 * 1000, // 30 seconds
  })
}
```

### Local State

**React Hooks:**
- `useState` - Component-local state
- `useRef` - Mutable references
- `useMemo` - Computed values
- `useCallback` - Memoized callbacks

**State Patterns:**
- Search/filter state in components
- UI state (modals, loading states)
- Form state
- Client-side preferences (localStorage)

## Logging and Monitoring

### Centralized Logging

**Logger Module** (`lib/logger.ts`):
- `logError()` - Error logging with Sentry
- `logWarning()` - Warning logging
- `logInfo()` - Informational logging

**Log Context:**
- Component name
- User ID
- Request details
- Error type
- Custom metadata

### Sentry Integration

**Configuration:**
- Server/Edge: `instrument.ts`
- Client: `instrumentation-client.ts`
- Build: `next.config.js` (source map upload)

**Features:**
- Automatic error capture
- Source map upload
- User context
- Performance monitoring
- Release tracking

**Error Boundaries:**
- `ErrorBoundary` component - React error boundary
- `global-error.tsx` - Global error handler
- Fallback UI with error details

### Analytics

**Database Analytics:**
- User tracking (`analytics_users`)
- Pageview tracking (`analytics_pageviews`)
- API request tracking (`analytics_api_requests`)

**Admin Dashboard:**
- `/stats` page (admin only)
- Usage statistics
- Request patterns
- User activity

## Code Organization

### Directory Structure

```
app/
├── api/              # API routes (Server Components)
│   ├── auth/         # Authentication endpoints
│   ├── playlists/    # Playlist endpoints
│   ├── bpm/          # BPM endpoints
│   └── analytics/    # Analytics endpoints
├── playlists/        # Playlist pages
├── stats/            # Analytics dashboard
├── components/       # Reusable components
├── hooks/            # Custom React hooks
└── providers/        # Context providers

lib/
├── spotify.ts        # Spotify API client
├── bpm.ts            # BPM detection logic
├── db.ts             # Database utilities
├── analytics.ts      # Analytics functions
├── errors.ts         # Error classes
├── logger.ts         # Logging utilities
├── playlists.ts      # Playlist utilities
├── types.ts          # TypeScript types
└── spotify-validation.ts  # ID validation
```

### Code Conventions

**File Naming:**
- Components: PascalCase (e.g., `PlaylistsTable.tsx`)
- Utilities: camelCase (e.g., `spotify.ts`)
- Types: camelCase (e.g., `types.ts`)
- Constants: UPPER_SNAKE_CASE (in files)

**Component Patterns:**
- Server Components by default
- Client Components when needed (`'use client'`)
- API routes use Route Handlers

**Type Safety:**
- Strict TypeScript configuration
- Shared types in `lib/types.ts`
- Interface definitions near usage
- Type inference where possible

## Key Design Decisions

### 1. Server vs Client Components

**Decision**: Server Components by default, Client Components only when needed.

**Rationale**:
- Better performance (less JavaScript to client)
- Automatic code splitting
- Direct database/API access
- SEO-friendly

**When to use Client Components:**
- Interactive UI (buttons, forms, modals)
- Browser APIs (localStorage, window)
- React hooks (useState, useEffect)
- Third-party libraries requiring client

### 2. OAuth with PKCE

**Decision**: Use PKCE flow instead of implicit flow.

**Rationale**:
- Enhanced security (prevents code interception)
- Works with public clients
- Recommended by OAuth 2.1 spec
- Required by Spotify for some scenarios

### 3. Database Caching

**Decision**: Cache playlist and BPM data in database.

**Rationale**:
- Reduces Spotify API calls (rate limit protection)
- Faster response times
- Cost reduction
- Better user experience

**Trade-offs**:
- Additional database storage
- Cache invalidation complexity
- Potential stale data (mitigated by snapshot_id)

### 4. External BPM Service

**Decision**: Use external microservice for BPM detection.

**Rationale**:
- Complex audio processing (requires Essentia, ffmpeg)
- Serverless-friendly (no binary dependencies)
- Scalable (independent service)
- Reusable (can be used by other projects)

**Trade-offs**:
- External dependency
- Additional latency
- Authentication complexity (GCP IAM)

### 5. React Query for State Management

**Decision**: Use React Query instead of Redux or Context.

**Rationale**:
- Built-in caching
- Automatic refetching
- Optimistic updates
- Minimal boilerplate
- Great TypeScript support

### 6. Sentry for Error Tracking

**Decision**: Use Sentry for error tracking and monitoring.

**Rationale**:
- Comprehensive error tracking
- Source map support
- Performance monitoring
- User context
- Release tracking

### 7. Neon Postgres

**Decision**: Use Neon (serverless Postgres) instead of traditional database.

**Rationale**:
- Serverless-friendly (scales to zero)
- Edge runtime compatible
- Automatic backups
- Branching support
- Vercel integration

## Performance Considerations

### Optimization Strategies

1. **Database Indexing**:
   - Indexes on frequently queried columns
   - Partial indexes for filtered queries
   - Composite indexes for multi-column queries

2. **API Response Caching**:
   - React Query client-side caching
   - Database server-side caching
   - HTTP cache headers

3. **Code Splitting**:
   - Automatic route-based splitting (Next.js)
   - Dynamic imports for large components
   - Lazy loading of heavy dependencies

4. **Image Optimization**:
   - Next.js Image component
   - Automatic format conversion
   - Responsive images
   - Lazy loading

5. **Bundle Optimization**:
   - Tree shaking
   - Dead code elimination
   - Minification
   - Source map generation (dev only)

## Security Considerations

### Authentication Security

- **PKCE Flow**: Prevents authorization code interception
- **HttpOnly Cookies**: Prevents XSS token theft
- **Secure Cookies**: HTTPS only in production
- **SameSite Cookies**: CSRF protection
- **Token Refresh**: Automatic token rotation

### API Security

- **Rate Limiting**: Protection against abuse
- **Input Validation**: Spotify ID validation
- **Error Handling**: No sensitive data in errors
- **CORS**: Restricted to application domain

### Database Security

- **Parameterized Queries**: SQL injection prevention
- **Connection Pooling**: Resource management
- **SSL Connections**: Encrypted database connections
- **Environment Variables**: Secrets not in code

## Deployment

### Vercel Deployment

**Build Process:**
1. Install dependencies (`pnpm install`)
2. Build application (`next build`)
3. Upload source maps to Sentry
4. Deploy to Edge/Serverless functions

**Environment Variables:**
- Required variables set in Vercel dashboard
- Different values for Production/Preview/Development
- Automatic injection at build time

**Edge Runtime:**
- API routes run on Edge runtime where possible
- Database client supports Edge runtime
- Automatic scaling based on traffic

## Troubleshooting Guide

### Common Issues

**Authentication Errors:**
- Check token expiration
- Verify redirect URI matches exactly
- Check cookie settings (secure, sameSite)
- Clear cookies and re-authenticate

**Rate Limiting:**
- Check request frequency
- Implement exponential backoff
- Use caching to reduce API calls
- Monitor rate limit headers

**Database Connection Issues:**
- Verify connection strings
- Check SSL configuration
- Verify IP allowlisting (if enabled)
- Test with direct connection (unpooled)

**BPM Service Errors:**
- Verify GCP service account key
- Check service account permissions
- Verify service URL is correct
- Check service logs in GCP Console

**Build Errors:**
- Verify all environment variables
- Check TypeScript errors
- Verify Sentry configuration
- Check package dependencies

## Development Workflow

### Local Development

1. **Setup**:
   ```bash
   pnpm install
   cp .env.example .env.local  # Configure environment variables
   psql $DATABASE_URL_UNPOOLED -f setup.sql  # Setup database
   ```

2. **Development Server**:
   ```bash
   pnpm dev
   ```

3. **Build**:
   ```bash
   pnpm build
   ```

4. **Linting**:
   ```bash
   pnpm lint
   ```

### Code Review Checklist

- [ ] TypeScript types are correct
- [ ] Error handling is appropriate
- [ ] Logging includes context
- [ ] Database queries use parameters
- [ ] API routes handle errors
- [ ] Client components are minimal
- [ ] Performance considerations addressed
- [ ] Security best practices followed

## Further Reading

- [Next.js Documentation](https://nextjs.org/docs)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Spotify Web API Documentation](https://developer.spotify.com/documentation/web-api)
- [OAuth 2.0 with PKCE](https://oauth.net/2/pkce/)
- [Neon Documentation](https://neon.tech/docs)
- [Sentry Documentation](https://docs.sentry.io/)

---

**Last Updated**: January 2025
**Maintained By**: delman@delman.it
