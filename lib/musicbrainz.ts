export const MB_BASE_URL = 'https://musicbrainz.org/ws/2';
export const USER_AGENT = 'SpotifyPlaylistBrowser/1.0.0 ( delman@delman.it )';

export interface MBSearchParams {
  producer?: string;
  songwriter?: string;
  mixer?: string;
  engineer?: string;
  artist?: string;
  track?: string;
  yearFrom?: string;
  yearTo?: string;
  bpmFrom?: string;
  bpmTo?: string;
  key?: string;
}

export interface MBArtistCredit {
  name: string;
  artist: {
    id: string;
    name: string;
    'sort-name': string;
  };
}

export interface MBRelease {
  id: string;
  title: string;
  date?: string;
  country?: string;
}

export interface MBRecording {
  id: string;
  title: string;
  length?: number;
  'artist-credit'?: MBArtistCredit[];
  releases?: MBRelease[];
  isrcs?: { id: string }[];
  tags?: { count: number; name: string }[];
}

export interface MBSearchResponse {
  created: string;
  count: number;
  offset: number;
  recordings: MBRecording[];
}

export interface CreditTrack {
  id: string; // MBID
  title: string;
  artist: string;
  album: string;
  year: string;
  length: number;
  isrc?: string;
  spotifyUri?: string; // Populated later
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
}