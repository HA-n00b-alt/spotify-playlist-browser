/**
 * Spotify ID validation utilities
 * Spotify IDs are base62 encoded strings (0-9, a-z, A-Z)
 */

/**
 * Validates if a string is a valid Spotify ID format
 * Spotify IDs are 22 characters long and contain only base62 characters (0-9, a-z, A-Z)
 */
export function isValidSpotifyId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false
  }
  
  // Spotify IDs are typically 22 characters
  if (id.length !== 22) {
    return false
  }
  
  // Check if it contains only base62 characters (0-9, a-z, A-Z)
  const base62Regex = /^[0-9a-zA-Z]+$/
  return base62Regex.test(id)
}

/**
 * Validates a Spotify track ID specifically
 */
export function isValidSpotifyTrackId(trackId: string): boolean {
  return isValidSpotifyId(trackId)
}

/**
 * Sanitizes and validates a Spotify track ID, returning null if invalid
 */
export function sanitizeSpotifyTrackId(trackId: string): string | null {
  if (!trackId) {
    return null
  }
  
  // Remove any whitespace
  const cleaned = trackId.trim()
  
  // Extract ID from Spotify URI if present (spotify:track:ID)
  const uriMatch = cleaned.match(/spotify:track:([0-9a-zA-Z]+)/)
  if (uriMatch) {
    return isValidSpotifyTrackId(uriMatch[1]) ? uriMatch[1] : null
  }
  
  // Extract ID from Spotify URL if present
  const urlMatch = cleaned.match(/spotify\.com\/track\/([0-9a-zA-Z]+)/)
  if (urlMatch) {
    return isValidSpotifyTrackId(urlMatch[1]) ? urlMatch[1] : null
  }
  
  // Check if it's already a valid ID
  return isValidSpotifyTrackId(cleaned) ? cleaned : null
}












