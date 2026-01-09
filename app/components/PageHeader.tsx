'use client'

import Link from 'next/link'
import UserMenu from './UserMenu'
import { useEffect, useRef, useState } from 'react'

interface PageHeaderProps {
  subtitle: string
  center?: boolean
  breadcrumbs?: Array<{
    label: string
    href?: string
  }>
  settingsItems?: React.ReactNode
}

export default function PageHeader({
  subtitle,
  center,
  breadcrumbs,
  settingsItems,
}: PageHeaderProps) {
  const [userName, setUserName] = useState<string | null>(null)
  const [bpmStatus, setBpmStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [bpmStatusMessage, setBpmStatusMessage] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showBpmApi, setShowBpmApi] = useState(true)
  const [showCreditSearch, setShowCreditSearch] = useState(true)
  const settingsRef = useRef<HTMLDivElement | null>(null)

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
    if (!isSettingsOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isSettingsOpen])

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
        <div className="relative">
          <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-gray-200/80 bg-white/70 backdrop-blur">
            <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 sm:px-8">
              <nav className="flex items-center gap-2 text-xs sm:text-sm text-gray-500">
                <Link
                  href="/"
                  aria-label="Home"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                    <path d="M3 10.5L12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 9.5V20h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                {(breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : [{ label: 'Playlists' }]).map((crumb, index, list) => (
                  <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                    <span className="text-gray-300">/</span>
                    {crumb.href && index < list.length - 1 ? (
                      <Link
                        href={crumb.href}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="font-semibold text-gray-900">{crumb.label}</span>
                    )}
                  </div>
                ))}
              </nav>

              <div className="flex items-center gap-3">
                <div className="relative" ref={settingsRef}>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen((prev) => !prev)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/70 text-gray-600 shadow-sm transition hover:text-gray-900"
                    aria-label="View options"
                    aria-expanded={isSettingsOpen}
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                      <circle cx="9" cy="7" r="2" fill="currentColor" />
                      <circle cx="15" cy="12" r="2" fill="currentColor" />
                      <circle cx="10" cy="17" r="2" fill="currentColor" />
                    </svg>
                  </button>

                  {isSettingsOpen && (
                    <div className="absolute right-0 mt-3 w-72 rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-xl">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-gray-700">
                            <span className="font-medium">BPM API</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={showBpmApi}
                              onClick={() => setShowBpmApi((prev) => !prev)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                                showBpmApi ? 'bg-emerald-500' : 'bg-gray-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                  showBpmApi ? 'translate-x-4' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                          {showBpmApi && (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span className={`h-2 w-2 rounded-full ${bpmStatusColor}`} />
                              <span>{bpmStatusLabel}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-gray-700">
                            <span className="font-medium">Credit Search</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={showCreditSearch}
                              onClick={() => setShowCreditSearch((prev) => !prev)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                                showCreditSearch ? 'bg-emerald-500' : 'bg-gray-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                  showCreditSearch ? 'translate-x-4' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                          {showCreditSearch && (
                            <Link
                              href="/credits"
                              className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                            >
                              <span className="text-sm">◎</span>
                              Open Credit Search
                            </Link>
                          )}
                        </div>

                        {settingsItems && (
                          <>
                            <div className="h-px bg-gray-100" />
                            <div className="space-y-2">{settingsItems}</div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-6 w-px bg-gray-200/80" />
                <UserMenu />
              </div>
            </div>
          </header>
          <div className="h-16" />
        </div>
      )}
    </div>
  )
}
