'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error)
  }, [error])

  // Show error message in production (sanitized)
  const errorMessage = error.message || 'Unknown error'
  const showErrorDetails = typeof window !== 'undefined' && 
    (window.location.search.includes('debug=true') || process.env.NODE_ENV === 'development')

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong!</h2>
            <p className="text-gray-700 mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {error.digest && (
              <p className="text-xs text-gray-500 mb-2">Error ID: {error.digest}</p>
            )}
            
            {showErrorDetails && (
              <details className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                <summary className="cursor-pointer text-sm text-gray-600 font-semibold mb-2">
                  Error Details (Click to expand)
                </summary>
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <p><strong>Message:</strong> {errorMessage}</p>
                  {error.stack && (
                    <div className="mt-2">
                      <strong>Stack trace:</strong>
                      <pre className="mt-1 p-2 bg-white rounded border border-gray-200 overflow-auto max-h-40 text-xs">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}
            
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              <p className="font-semibold mb-1">Troubleshooting steps:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Check your browser console (F12) for more details</li>
                <li>Check the Network tab for failed API requests</li>
                <li>Try clearing cookies and logging in again</li>
                <li>Contact support with the Error ID above if the issue persists</li>
              </ul>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => reset()}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

