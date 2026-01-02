# Implementation Plan

## Checklist

- [x] **Scaffold Next.js app with TypeScript configuration**
  - Set up Next.js 14 with App Router
  - Configure TypeScript
  - Set up Tailwind CSS for styling
  - Configure ESLint

- [x] **Set up Spotify OAuth with Authorization Code + PKCE flow**
  - Implement `/api/auth/login` route to initiate OAuth
  - Generate PKCE code verifier and challenge
  - Store code verifier in secure cookie
  - Implement `/api/auth/callback` route to handle OAuth callback
  - Exchange authorization code for access token
  - Store access token and refresh token in cookies
  - Handle token refresh logic

- [x] **Create home page (/) with Login with Spotify button**
  - Simple landing page with login button
  - Link to `/api/auth/login` endpoint

- [x] **Create /playlists page to list all user playlists**
  - Server-side rendered page
  - Fetch all playlists from Spotify API (handle pagination)
  - Display playlists in a grid layout
  - Show playlist cover image, name, owner, and track count
  - Link to individual playlist pages
  - Handle authentication errors

- [x] **Create /playlists/[id] page with tracks table and search functionality**
  - Client-side component for interactive search
  - Fetch all tracks for a playlist (handle pagination)
  - Display tracks in a table with all required metadata:
    - Track name, artists, album, release date, duration, explicit flag
    - Playlist item added_at date
    - External Spotify URL link
  - Implement client-side search/filter across all metadata fields
  - Show track count and filtered results

- [x] **Implement server-side API routes for Spotify API calls**
  - `/api/playlists` - Get all user playlists
  - `/api/playlists/[id]/tracks` - Get all tracks for a playlist
  - Create reusable Spotify API client library (`lib/spotify.ts`)
  - Handle authentication token management

- [x] **Handle pagination for playlists and tracks**
  - Automatically fetch all pages of playlists
  - Automatically fetch all pages of tracks
  - Use Spotify API's `next` field for pagination

- [x] **Implement rate limiting handling (429 responses)**
  - Check for 429 status code
  - Read `Retry-After` header
  - Wait and retry the request

- [x] **Add environment variables configuration**
  - Create `.env.example` file
  - Document required Spotify credentials:
    - `SPOTIFY_CLIENT_ID`
    - `SPOTIFY_CLIENT_SECRET`
    - `SPOTIFY_REDIRECT_URI`
  - Add to README with setup instructions

## Technical Details

### Authentication Flow
1. User clicks "Login with Spotify" → `/api/auth/login`
2. Generate PKCE code verifier and challenge
3. Redirect to Spotify authorization endpoint
4. User authorizes → Spotify redirects to `/api/auth/callback`
5. Exchange code for access token using code verifier
6. Store tokens in httpOnly cookies
7. Redirect to `/playlists`

### API Routes
- **GET `/api/auth/login`**: Initiates OAuth flow
- **GET `/api/auth/callback`**: Handles OAuth callback and token exchange
- **GET `/api/playlists`**: Returns all user playlists (server-side)
- **GET `/api/playlists/[id]/tracks`**: Returns all tracks for a playlist (server-side)

### Spotify API Integration
- Uses Authorization Code + PKCE flow (more secure than implicit flow)
- Automatically handles token refresh
- Implements rate limiting with retry logic
- Handles pagination automatically for playlists and tracks

### Data Display
- **Playlists page**: Grid of playlist cards with images, names, owners, track counts
- **Tracks page**: Table with columns for:
  - Track name (with explicit indicator)
  - Artists
  - Album
  - Release date
  - Duration (formatted as MM:SS)
  - Added at date
  - External Spotify link

### Search Functionality
- Client-side search across all visible metadata
- Searches: track name, artist names, album name, release date
- Real-time filtering as user types
- Shows filtered count vs total count

