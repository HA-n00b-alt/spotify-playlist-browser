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
  showCreditsLink?: boolean
}

export default function PageHeader({
  subtitle,
  backLink,
  rightButtons,
  center,
  showCreditsLink = true,
}: PageHeaderProps) {
  const [userName, setUserName] = useState<string | null>(null)
  const [bpmStatus, setBpmStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [bpmStatusMessage, setBpmStatusMessage] = useState<string | null>(null)

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
    setBpmStatusMessage(null)
    fetch('/api/bpm/health', { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const message =
            typeof data?.error === 'string' && data.error.trim()
              ? data.error
              : `BPM health check failed: ${res.status}`
          throw new Error(message)
        }
        return data
      })
      .then((data) => {
        if (!isMounted) return
        if (data?.ok) {
          setBpmStatus('ok')
          setBpmStatusMessage(null)
          return
        }
        const message =
          typeof data?.error === 'string' && data.error.trim()
            ? data.error
            : 'BPM API reported unhealthy'
        setBpmStatus('error')
        setBpmStatusMessage(message)
      })
      .catch((err) => {
        if (!isMounted) return
        setBpmStatus('error')
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : 'Unable to reach BPM API'
        setBpmStatusMessage(message)
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
    bpmStatus === 'ok'
      ? 'BPM API healthy'
      : bpmStatus === 'checking'
        ? 'BPM API checking'
        : `BPM API error${bpmStatusMessage ? `: ${bpmStatusMessage}` : ''}`

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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Spotify Playlist Tools</h1>
              <p className="text-sm text-gray-500 mt-1">{displaySubtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-600"
                title={bpmStatusLabel}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${bpmStatusColor}`} />
                <span>BPM API</span>
              </div>
              {showCreditsLink && (
                <Link
                  href="/credits"
                  className="inline-flex items-center px-3 py-1 rounded-full border border-green-200 text-xs text-green-700 hover:text-green-800 hover:border-green-300 hover:bg-green-50"
                >
                  Credit Search
                </Link>
              )}
              {rightButtons}
              <UserMenu />
            </div>
          </div>
        </div>
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
