# Available Playlist Fields from Spotify API

Based on the Spotify Web API, here are all the fields available in a playlist object:

## Currently Displayed
- ✅ **name** - Playlist name
- ✅ **images** - Array of cover images (thumbnail displayed)
- ✅ **owner.display_name** - Playlist owner name
- ✅ **tracks.total** - Number of tracks
- ✅ **description** - Playlist description (shown as subtitle if available)

## Additional Available Fields

### Basic Info
- **id** - Unique Spotify ID for the playlist
- **href** - Spotify Web API endpoint for the playlist
- **uri** - Spotify URI for the playlist
- **type** - Object type: "playlist"
- **snapshot_id** - Version identifier for the playlist

### Owner Information
- **owner.id** - Owner's Spotify user ID
- **owner.external_urls** - Owner's Spotify profile URL
- **owner.href** - Owner's Spotify Web API endpoint
- **owner.type** - Owner object type: "user"
- **owner.uri** - Owner's Spotify URI

### Visibility & Collaboration
- **public** - Boolean indicating if playlist is public
- **collaborative** - Boolean indicating if playlist is collaborative

### Followers
- **followers.total** - Total number of followers (if available)

### External Links
- **external_urls.spotify** - Link to open playlist in Spotify app/web

### Tracks Object
- **tracks.href** - Endpoint to fetch playlist tracks
- **tracks.limit** - Maximum number of tracks returned
- **tracks.next** - URL to next page of tracks
- **tracks.offset** - Offset of returned items
- **tracks.previous** - URL to previous page of tracks
- **tracks.total** - Total number of tracks (already displayed)

## Potential Additions to Table

You could add columns for:
- **Public/Private** - Show lock icon for private, globe for public
- **Collaborative** - Show indicator if collaborative
- **Followers** - Display follower count (if available)
- **Description** - Already shown as subtitle under playlist name
- **Spotify Link** - External link icon to open in Spotify

## Example Usage

```typescript
// Check if playlist is public
{playlist.public ? '🌐 Public' : '🔒 Private'}

// Show collaborative indicator
{playlist.collaborative && <span>👥 Collaborative</span>}

// Show followers if available
{playlist.followers && (
  <span>{playlist.followers.total} followers</span>
)}

// Link to Spotify
<a href={playlist.external_urls.spotify} target="_blank">
  Open in Spotify
</a>
```

