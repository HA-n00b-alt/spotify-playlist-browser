'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function RateLimitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [countdown, setCountdown] = useState<number | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const maxRetries = 3
  const endpoint = searchParams.get('endpoint') || '/playlists'
  const retryAfter = parseInt(searchParams.get('retryAfter') || '0', 10)

  useEffect(() => {
    if (retryCount >= maxRetries) {
      setError('Maximum retries reached. Please try again later.')
      setIsRetrying(false)
      return
    }

    if (!isRetrying && retryCount === 0) {
      // Start first retry
      startRetry()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount, isRetrying])

  const startRetry = () => {
    setIsRetrying(true)
    setError(null)
    
    // Calculate wait time: use retryAfter if provided, otherwise exponential backoff
    const waitTime = retryAfter > 0 
      ? retryAfter 
      : (retryCount + 1) * 1000 // 1s, 2s, 3s
    
    // Start countdown
    let remaining = waitTime / 1000 // Convert to seconds
    setCountdown(Math.ceil(remaining))
    
    const countdownInterval = setInterval(() => {
      remaining -= 0.1
      if (remaining <= 0) {
        clearInterval(countdownInterval)
        setCountdown(0)
        performRetry()
      } else {
        setCountdown(Math.ceil(remaining))
      }
    }, 100)

    // Perform retry after wait time
    setTimeout(() => {
      clearInterval(countdownInterval)
      performRetry()
    }, waitTime)
  }

  const performRetry = async () => {
    try {
      // Determine the actual endpoint to fetch
      const fetchEndpoint = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`
      
      // Try to fetch the endpoint
      const response = await fetch(fetchEndpoint, {
        method: 'GET',
        credentials: 'include',
      })

      if (response.status === 429) {
        // Still rate limited, get Retry-After header
        const newRetryAfter = response.headers.get('Retry-After')
        const retryAfterSeconds = newRetryAfter ? parseInt(newRetryAfter, 10) : 0
        
        // Update URL with new retry info
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('retryAfter', retryAfterSeconds.toString())
        window.history.replaceState({}, '', newUrl.toString())
        
        // Increment retry count and try again
        setRetryCount(prev => prev + 1)
        setIsRetrying(false)
        return
      }

      if (response.ok) {
        // Success! Redirect to the appropriate page
        if (endpoint.startsWith('/api/playlists') || endpoint === '/playlists') {
          window.location.href = '/playlists'
        } else {
          window.location.href = endpoint
        }
        return
      }

      // Other error, redirect to playlists with error
      const errorText = await response.text().catch(() => 'Failed to load')
      router.push(`/playlists?error=${encodeURIComponent(errorText.substring(0, 100))}`)
    } catch (err) {
      console.error('[Rate Limit Page] Retry error:', err)
      setError('An error occurred. Please try again.')
      setIsRetrying(false)
    }
  }

  const handleCancel = () => {
    // Go to home without clearing cookies (client-side redirect with skipRedirect param)
    window.location.href = '/?skipRedirect=true'
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="text-center max-w-md w-full">
        <div className="mb-6">
          <svg
            className="w-20 h-20 mx-auto text-yellow-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-gray-900">
          Rate Limit Reached
        </h1>
        
        <p className="text-gray-600 mb-6 text-base sm:text-lg">
          Spotify API is temporarily rate limiting requests. We&apos;re automatically retrying...
        </p>

        {isRetrying && countdown !== null && (
          <div className="mb-6">
            <div className="text-4xl font-bold text-green-600 mb-2">
              {countdown}
            </div>
            <p className="text-sm text-gray-500">
              Retrying in {countdown} second{countdown !== 1 ? 's' : ''}... (Attempt {retryCount + 1} of {maxRetries})
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {!isRetrying && !error && retryCount < maxRetries && (
          <div className="mb-6">
            <p className="text-sm text-gray-500">Preparing to retry...</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleCancel}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-6 rounded-full transition-colors"
          >
            Cancel & Go Home
          </button>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          This page will automatically retry the request. You can cancel at any time.
        </p>
      </div>
    </div>
  )
}

