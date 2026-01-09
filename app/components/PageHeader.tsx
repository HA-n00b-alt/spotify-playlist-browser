'use client'

import Link from 'next/link'
import UserMenu from './UserMenu'
import { useEffect, useState } from 'react'

interface PageHeaderProps {
  subtitle: string
  backLink?: {
    href: string
    text: string
  }
  rightButtons?: React.ReactNode
  center?: boolean
}

export default function PageHeader({ subtitle, backLink, rightButtons, center }: PageHeaderProps) {
  const [userName, setUserName] = useState<string | null>(null)
  const [bpmStatus, setBpmStatus] = useState<'checking' | 'ok' | 'error'>('checking')

  useEffect(() => {
    // Fetch user info for subtitle
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUserName(data.user.display_name || data.user.id || null)
        }
      })
      .catch((err) => {
        console.error('Error fetching user info:', err)
      })
  }, [])

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    setBpmStatus('checking')
    fetch('/api/bpm/health', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`BPM health check failed: ${res.status}`)
        }
        return res.json().catch(() => ({}))
      })
      .then((data) => {
        if (!isMounted) return
        setBpmStatus(data?.ok ? 'ok' : 'error')
      })
      .catch(() => {
        if (!isMounted) return
        setBpmStatus('error')
      })
      .finally(() => {
        clearTimeout(timeoutId)
      })

    return () => {
      isMounted = false
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  const bpmStatusColor =
    bpmStatus === 'ok' ? 'bg-green-500' : bpmStatus === 'checking' ? 'bg-amber-400' : 'bg-red-500'
  const bpmStatusLabel =
    bpmStatus === 'ok' ? 'BPM API healthy' : bpmStatus === 'checking' ? 'BPM API checking' : 'BPM API error'

  // Replace [user] placeholder with actual username if available
  const displaySubtitle = subtitle.includes('[user]') && userName
    ? subtitle.replace('[user]', userName)
    : subtitle

  return (
    <div className="mb-6 sm:mb-8">
      {center ? (
        /* Centered layout for login/error pages */
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Spotify Playlist Tools</h1>
          <p className="text-sm text-gray-500 mt-1">{displaySubtitle}</p>
        </div>
      ) : (
        /* Default layout for authenticated pages */
        <>
          {/* Mobile: User menu top right, title/subtitle below */}
          {/* Desktop: User menu and buttons on the right, title/subtitle on the left */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              {/* Mobile: Header with user menu on top */}
              <div className="flex justify-between items-start mb-2 sm:hidden">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900">Spotify Playlist Tools</h1>
                  <p className="text-sm text-gray-500 mt-1">{displaySubtitle}</p>
                </div>
                <div className="flex-shrink-0 ml-4 flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500" title={bpmStatusLabel}>
                    <span className={`h-2.5 w-2.5 rounded-full ${bpmStatusColor}`} />
                    <span>BPM API</span>
                  </div>
                  <UserMenu />
                </div>
              </div>
              {/* Desktop: Header without user menu (it's on the right) */}
              <div className="hidden sm:block">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Spotify Playlist Tools</h1>
                <p className="text-sm text-gray-500 mt-1">{displaySubtitle}</p>
              </div>
              {/* Mobile: Buttons below title */}
              {rightButtons && (
                <div className="mt-3 sm:hidden">
                  {rightButtons}
                </div>
              )}
            </div>
            {/* Desktop: User menu and buttons on the right */}
            <div className="hidden sm:flex gap-2 items-center">
              <div className="flex items-center gap-2 text-xs text-gray-500" title={bpmStatusLabel}>
                <span className={`h-2.5 w-2.5 rounded-full ${bpmStatusColor}`} />
                <span>BPM API</span>
              </div>
              {rightButtons}
              <UserMenu />
            </div>
          </div>
        </>
      )}
      {backLink && (
        <Link
          href={backLink.href}
          className="text-blue-600 hover:text-blue-700 inline-block text-sm sm:text-base"
        >
          {backLink.text}
        </Link>
      )}
    </div>
  )
}


