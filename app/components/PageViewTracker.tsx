'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    fetch('/api/analytics/track-pageview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: pathname }),
    }).catch((error) => {
      console.error('[Analytics] Failed to track pageview:', error)
    })
  }, [pathname])

  return null
}
