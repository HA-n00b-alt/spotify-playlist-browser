# Spotify Authentication Implementation

## Overview
This document describes the Spotify OAuth authentication implementation using Authorization Code flow with PKCE (Proof Key for Code Exchange).

## Authentication Flow

1. **User initiates login** → `/api/auth/login`
   - Generates PKCE code verifier and challenge
   - Stores code verifier in secure httpOnly cookie
   - Redirects to Spotify authorization endpoint

2. **User authorizes** → Spotify redirects to `/api/auth/callback`
   - Extracts authorization code from query params
   - Retrieves code verifier from cookie
   - Exchanges code for access token using PKCE
   - Stores access token and refresh token in secure httpOnly cookies
   - Redirects to `/playlists`

3. **Token refresh** (automatic)
   - When access token expires or is invalid
   - Uses refresh token to get new access token
   - Updates access token cookie automatically

## API Endpoints

### `/api/auth/login` (GET)
Initiates the OAuth flow by redirecting to Spotify's authorization endpoint.

**Response:** Redirect to Spotify

### `/api/auth/callback` (GET)
Handles the OAuth callback from Spotify.

**Query Parameters:**
- `code` - Authorization code from Spotify
- `error` - Error code if authorization failed

**Response:** Redirect to `/playlists` on success, or `/` with error on failure

### `/api/auth/logout` (GET/POST)
Clears all authentication cookies and redirects to home page.

**Response:** Redirect to `/`

### `/api/auth/status` (GET)
Checks authentication status and optionally returns user info.

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "user_id",
    "display_name": "User Name",
    "email": "user@example.com"
  }
}
```
or
```json
{
  "authenticated": false
}
```

## Token Management

### Storage
- **Access Token**: Stored in httpOnly cookie with expiration time
- **Refresh Token**: Stored in httpOnly cookie (1 year expiry)
- **Code Verifier**: Temporary cookie (30 minutes) for PKCE flow

### Security
- All cookies are httpOnly (not accessible via JavaScript)
- Cookies use `secure` flag in production (HTTPS only)
- Cookies use `sameSite: 'lax'` to prevent CSRF attacks
- PKCE flow prevents authorization code interception attacks

### Automatic Refresh
The `lib/spotify.ts` module automatically handles token refresh:
- Checks if access token exists
- If missing or expired, uses refresh token to get new access token
- Updates cookie with new access token
- Throws `Unauthorized` error if refresh fails

## Usage in Components

### Server Components
```typescript
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value
  return !!accessToken
}
```

### API Routes
Use the `makeSpotifyRequest` function from `lib/spotify.ts`:
```typescript
import { getPlaylists, getPlaylistTracks } from '@/lib/spotify'

// Automatically handles auth and token refresh
const playlists = await getPlaylists()
```

## Error Handling

### Common Errors
- **Unauthorized**: No valid access token or refresh token
- **Token exchange failed**: Invalid authorization code or expired code verifier
- **Access denied**: User denied authorization on Spotify
- **Rate limiting**: Automatically handled with retry logic

### Error Display
Errors are displayed on the home page with user-friendly messages.

## Environment Variables

Required environment variables:
```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=https://searchmyplaylist.delman.it/api/auth/callback
NEXT_PUBLIC_BASE_URL=https://searchmyplaylist.delman.it
```

For local development:
```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Scopes

The application requests the following Spotify scopes:
- `playlist-read-private` - Read user's private playlists
- `playlist-read-collaborative` - Read user's collaborative playlists

## Improvements Made

1. ✅ **Token refresh updates cookies** - When refreshing, the new access token is stored in cookie
2. ✅ **Secure cookies in production** - Added `secure` flag for HTTPS-only cookies
3. ✅ **Logout endpoint** - Added `/api/auth/logout` to clear authentication
4. ✅ **Auth status endpoint** - Added `/api/auth/status` to check authentication state
5. ✅ **Improved home page** - Better error handling and auto-redirect if authenticated
6. ✅ **Logout button** - Added logout button to playlists page

