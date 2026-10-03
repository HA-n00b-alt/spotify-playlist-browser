---
id: adr.remove_muso
title: "Remove the Muso.ai integration"
status: accepted
date: 2026-10-03
---

## Context

Muso.ai (`lib/muso.ts`, `MUSO_API_KEY`) was used for three things:

- **ISRC enrichment.** It filled in missing ISRCs on cached playlist tracks (`tracks_data`), on
  refresh and on cached reads, cached in `muso_track_cache` and `muso_album_cache`.
- **BPM preview lookup.** `muso_spotify` was the second preview source for the BPM service, after
  the Deezer ISRC lookup and before iTunes search and Deezer search.
- **Credits and admin tooling.** It was the first source for track credits, with MusicBrainz as the
  fallback. It also backed the Muso lookup on the admin ISRC debug page, the "resolve all" ISRC
  mismatch action, `/api/admin/muso-status` and `/api/muso/preview`.

The client's own header comment noted that the Muso developer API was deprecated, so the
integration was carrying an external dependency without a future, plus an API key, two cache
tables and two concurrency settings.

## Decision

Remove Muso entirely rather than keep it behind a flag:

- Delete the client, the routes `/api/muso/preview`, `/api/bpm/muso-preview`,
  `/api/admin/muso-status`, `/api/admin/isrc-debug/muso-enrich` and
  `/api/admin/isrc-mismatches/resolve-all`, and the debug script.
- Resolve BPM previews from Deezer ISRC lookup, then iTunes search with ISRC matching, then Deezer
  search (`lib/bpm.ts`).
- Take credits from MusicBrainz only, and base the ISRC tooling on the remaining sources.
- Drop Muso from the UI, footer, health checks, stats, docs and `setup.sql`, along with its settings
  (`MUSO_API_KEY`, `MUSO_TRACK_SEARCH_CONCURRENCY`, `MUSO_RESOLVE_CONCURRENCY`).

This has been live since the 2026-06-07 deploy and was committed as `09cac96` on 2026-10-03.

## Consequences

- Tracks whose ISRC is missing from Spotify are no longer enriched, so ISRC matching and the ISRC
  mismatch page see more gaps. The bulk "resolve all" action is gone, so admins resolve mismatches
  individually.
- The BPM service has one fewer preview source, so a few more tracks can end in `computed_failed`.
- Credits come from MusicBrainz alone, so tracks MusicBrainz doesn't know have none.
- One fewer secret, external dependency and failure mode in health checks.
- `setup.sql` no longer creates `muso_track_cache`, `muso_album_cache` or
  `idx_muso_track_cache_isrcs_gin`; `migrations/0001_drop_muso_cache.sql` drops them from existing
  databases (#15).
- Reintroducing Muso, or any paid metadata source, should be a new ADR that supersedes this one.
