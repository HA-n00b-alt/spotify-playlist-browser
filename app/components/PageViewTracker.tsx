'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // Track pageview asynchronously
    fetch('/api/analytics/track-pageview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: pathname }),
    }).catch((error) => {
      // Silently fail - analytics should not break the app
      console.error('[Analytics] Failed to track pageview:', error)
    })
  }, [pathname])

  return null // This component doesn't render anything
}

