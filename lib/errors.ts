/**
 * Custom error classes for different types of failures
 */

export class AuthenticationError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthenticationError'
    Object.setPrototypeOf(this, AuthenticationError.prototype)
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number | null = null,
    public statusCode: number = 429
  ) {
    super(message)
    this.name = 'RateLimitError'
    Object.setPrototypeOf(this, RateLimitError.prototype)
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'NetworkError'
    Object.setPrototypeOf(this, NetworkError.prototype)
  }
}

export class SpotifyAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint?: string
  ) {
    super(message)
    this.name = 'SpotifyAPIError'
    Object.setPrototypeOf(this, SpotifyAPIError.prototype)
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message)
    this.name = 'DatabaseError'
    Object.setPrototypeOf(this, DatabaseError.prototype)
  }
}

/**
 * Helper function to create appropriate error from response
 */
export function createErrorFromResponse(
  response: Response,
  endpoint?: string
): Error {
  if (response.status === 401 || response.status === 403) {
    return new AuthenticationError(
      `Authentication failed: ${response.statusText}`,
      response.status
    )
  }
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    return new RateLimitError(
      'Rate limit exceeded',
      retryAfter ? parseInt(retryAfter, 10) : null,
      429
    )
  }
  
  if (response.status >= 500) {
    return new NetworkError(
      `Server error: ${response.statusText}`,
      undefined,
      response.status
    )
  }
  
  return new SpotifyAPIError(
    `API error: ${response.statusText}`,
    response.status,
    endpoint
  )
}






