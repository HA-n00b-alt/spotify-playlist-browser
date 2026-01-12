import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, makeSpotifyRequest } from '@/lib/spotify';
import { CreditTrack } from '@/lib/musicbrainz';
import { logError, withApiLogging } from '@/lib/logger';

interface SpotifyUserProfile {
  id: string
}

interface SpotifyPlaylist {
  id: string
}

interface SpotifyTrackItem {
  uri: string
}

interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrackItem[]
  }
}

export const POST = withApiLogging(async (request: Request | NextRequest) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, tracks } = body as { name: string; tracks: CreditTrack[] };

    if (!tracks || tracks.length === 0) {
      return NextResponse.json({ error: 'No tracks provided' }, { status: 400 });
    }

    // 1. Get User ID
    const user = await makeSpotifyRequest<SpotifyUserProfile>('/me');
    const userId = user.id;

    // 2. Create Playlist
    const playlist = await makeSpotifyRequest<SpotifyPlaylist>(`/users/${userId}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name: name || 'MusicBrainz Search Results',
        description: 'Created via Spotify Playlist Browser from MusicBrainz credits search',
        public: false
      })
    });

    // 3. Resolve Tracks to Spotify URIs
    // This is the heavy part. We need to search for each track if we don't have a direct link.
    // We'll use ISRC if available, otherwise Title + Artist.
    
    const uris: string[] = [];
    const batchSize = 5; // Process in small batches to avoid rate limits
    
    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (track) => {
        try {
          let query = '';
          if (track.isrc) {
            query = `isrc:${track.isrc}`;
          } else {
            // Clean up artist name (remove "feat." etc for better search)
            const cleanArtist = track.artist.split(' feat.')[0].split(' ft.')[0];
            query = `track:${track.title} artist:${cleanArtist}`;
          }

          const searchRes = await makeSpotifyRequest<SpotifySearchResponse>(
            `/search?q=${encodeURIComponent(query)}&type=track&limit=1`
          );

          if (searchRes.tracks?.items && searchRes.tracks.items.length > 0) {
            return searchRes.tracks.items[0].uri;
          }
          
          // Fallback: if ISRC search failed, try text search
          if (track.isrc) {
             const cleanArtist = track.artist.split(' feat.')[0].split(' ft.')[0];
             const textQuery = `track:${track.title} artist:${cleanArtist}`;
             const fallbackRes = await makeSpotifyRequest<SpotifySearchResponse>(
                `/search?q=${encodeURIComponent(textQuery)}&type=track&limit=1`
             );
             if (fallbackRes.tracks?.items && fallbackRes.tracks.items.length > 0) {
                return fallbackRes.tracks.items[0].uri;
             }
          }
          
          return null;
        } catch (e) {
          logError(e, { component: 'CreatePlaylistFromSearch', trackTitle: track.title });
          return null;
        }
      });

      const results = await Promise.all(batchPromises);
      results.forEach(uri => {
        if (uri) uris.push(uri);
      });
    }

    // 4. Add Tracks to Playlist
    if (uris.length > 0) {
      // Spotify allows adding max 100 tracks per request
      for (let i = 0; i < uris.length; i += 100) {
        const uriBatch = uris.slice(i, i + 100);
        await makeSpotifyRequest(`/playlists/${playlist.id}/tracks`, {
          method: 'POST',
          body: JSON.stringify({ uris: uriBatch })
        });
      }
    }

    return NextResponse.json({ playlistId: playlist.id, tracksAdded: uris.length });
  } catch (error: any) {
    logError(error, { component: 'CreatePlaylistFromSearch' });
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 });
  }
})
