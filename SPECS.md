# Spotify Playlist Browser - Spec

## Goal
A web app that lets a user log in with Spotify, fetch all their playlists, pick one, view all tracks + metadata, and search/filter by any metadata.

## User flows
1. User clicks “Login with Spotify”
2. OAuth completes; user lands on /playlists
3. App fetches and shows all playlists
4. User selects a playlist
5. App fetches all playlist tracks (pagination) and renders a table
6. User can search across all visible metadata columns

## Pages
- / (home + login)
- /playlists (list/select playlists)
- /playlists/[id] (tracks table + search)

## Data to display (track table)
- Track: name, artists, album, release date, duration, explicit
- Playlist item: added_at
- Links: track external URL (Spotify)

## Requirements
- Use Spotify OAuth (Authorization Code + PKCE preferred)
- Use Spotify Web API only (no audio download)
- Handle pagination and rate limiting (429)
- Search: MVP client-side search; optional DB later

## Acceptance criteria
- Login works end-to-end
- Playlists list loads for the logged-in user
- Selecting a playlist shows all tracks (not just first page)
- Search filters rows by matching any metadata field
