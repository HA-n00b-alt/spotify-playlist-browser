# Spotify Playlist Browser

A Next.js web application that lets you log in with Spotify, browse your playlists, and view/search tracks with metadata.

## Features

- Spotify OAuth authentication with PKCE
- View all your playlists
- Browse tracks in any playlist
- Search/filter tracks by name, artist, album, or release date
- Displays track metadata: name, artists, album, release date, duration, explicit flag, added date
- Handles pagination automatically
- Rate limiting protection

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file with your Spotify credentials:
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=https://searchmyplaylist.delman.it/api/auth/callback
NEXT_PUBLIC_BASE_URL=https://searchmyplaylist.delman.it
```

   For local development, use:
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

3. Get your Spotify credentials:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app or select your existing app
   - Add the following redirect URIs to your app:
     - `https://searchmyplaylist.delman.it/api/auth/callback` (production)
     - `http://localhost:3000/api/auth/callback` (local development)

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Pages

- `/` - Home page with login button
- `/playlists` - List of all your playlists
- `/playlists/[id]` - Tracks table for a specific playlist with search functionality

## Implementation Plan

- [x] Scaffold Next.js app with TypeScript configuration
- [x] Set up Spotify OAuth with Authorization Code + PKCE flow
- [x] Create home page (/) with Login with Spotify button
- [x] Create /playlists page to list all user playlists
- [x] Create /playlists/[id] page with tracks table and search functionality
- [x] Implement server-side API routes for Spotify API calls (auth, playlists, tracks)
- [x] Handle pagination for playlists and tracks
- [x] Implement rate limiting handling (429 responses)
- [x] Add environment variables configuration for Spotify credentials

