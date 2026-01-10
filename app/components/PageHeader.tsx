'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [bpmStatus, setBpmStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [bpmStatusMessage, setBpmStatusMessage] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [adminRequestStatus, setAdminRequestStatus] = useState<'idle' | 'requested' | 'pending' | 'already_admin' | 'error'>('idle')
  const [adminRequestMessage, setAdminRequestMessage] = useState<string | null>(null)
  const [adminRequestName, setAdminRequestName] = useState('')
  const [adminRequestEmail, setAdminRequestEmail] = useState('')

  useEffect(() => {
    // Fetch user info for subtitle
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setIsAuthenticated(true)
          setUserName(data.user.display_name || data.user.id || null)
          setAdminRequestName(data.user.display_name || data.user.id || '')
          setAdminRequestEmail(data.user.email || '')
          fetch('/api/auth/is-admin')
            .then((res) => res.json())
            .then((adminData) => {
              setIsAdmin(Boolean(adminData?.isAdmin))
              setIsSuperAdmin(Boolean(adminData?.isSuperAdmin))
            })
            .catch(() => {})
          return
        }
        setIsAuthenticated(false)
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setUserName(null)
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
    if (!isMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isMenuOpen])

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
  const playlistsHref = isAuthenticated ? '/playlists' : '/api/auth/login'

  const handleRequestAdmin = async () => {
    if (!isAuthenticated) {
      window.location.href = '/api/auth/login'
      return
    }

    const trimmedEmail = adminRequestEmail.trim()
    if (!trimmedEmail) {
      setAdminRequestStatus('error')
      setAdminRequestMessage('Email is required to request admin access.')
      return
    }

    setAdminRequestStatus('idle')
    setAdminRequestMessage(null)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: adminRequestName.trim() || userName || '',
          email: trimmedEmail,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const message = typeof payload?.error === 'string' ? payload.error : 'Failed to request admin access'
        throw new Error(message)
      }
      const data = await res.json().catch(() => ({}))
      const status =
        data?.status === 'pending' || data?.status === 'already_admin' || data?.status === 'requested'
          ? data.status
          : 'requested'
      setAdminRequestStatus(status)
      setAdminRequestMessage(
        status === 'already_admin'
          ? 'Admin access already granted.'
          : status === 'pending'
          ? 'Request already pending.'
          : 'Request submitted for approval.'
      )
    } catch (error) {
      setAdminRequestStatus('error')
      setAdminRequestMessage('Unable to submit request. Please try again.')
    }
  }

  return (
    <div className="mb-2 sm:mb-3">
      {center ? (
        /* Centered layout for login/error pages */
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#171923]">Spotify Playlist Tools</h1>
          <p className="text-sm text-gray-500 mt-1">{displaySubtitle}</p>
          {showBackLink ? (
            <div className="mx-auto mt-2 w-full max-w-7xl px-4 sm:px-8 lg:px-0 text-left">
              <Link
                href={backHref}
                className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
                  <path d="M10.5 3.5 6 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        /* Default layout for authenticated pages */
        <div className="relative">
          <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-gray-200/80 bg-white/70 backdrop-blur">
            <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 sm:px-8 lg:px-0">
              <nav className="flex items-center gap-2 text-xs sm:text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="relative" ref={menuRef}>
                    <button
                      type="button"
                      aria-label="Open menu"
                      aria-expanded={isMenuOpen}
                      onClick={() => setIsMenuOpen((prev) => !prev)}
                      className="inline-flex h-5 w-5 items-center justify-center"
                    >
                      <Image
                        src="/playlist-tools-logo.svg"
                        alt="Spotify Playlist Tools"
                        width={20}
                        height={20}
                        className="h-5 w-5 opacity-70"
                      />
                    </button>
                    {isMenuOpen && (
                      <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 text-sm shadow-xl">
                        <Link
                          href="/"
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        >
                          Home
                        </Link>
                        <Link
                          href={playlistsHref}
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        >
                          Playlists
                        </Link>
                        <Link
                          href="/credits"
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        >
                          Credit Search
                        </Link>
                        <Link
                          href="/docs"
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        >
                          Documentation
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : [{ label: 'Playlists' }]).map((crumb, index, list) => {
                      const label = userName && crumb.label.includes('[user]')
                        ? crumb.label.replace('[user]', userName)
                        : crumb.label
                      return (
                        <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                          {index > 0 ? <span className="text-gray-300">/</span> : null}
                          {crumb.href && index < list.length - 1 ? (
                            <Link
                              href={crumb.href}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              {label}
                            </Link>
                          ) : (
                            <span className="font-semibold text-[#171923]">{label}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
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
                      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.08a1.7 1.7 0 0 0-1.55 1Z"
                      />
                    </svg>
                  </button>

                  {isSettingsOpen && (
                    <div className="absolute right-0 mt-3 w-72 rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-xl">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                            BPM API
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <span className={`h-2 w-2 rounded-full ${bpmStatusColor}`} />
                            <span>{bpmStatusLabel}</span>
                          </div>
                        </div>

                        {settingsItems && (
                          <>
                            <div className="h-px bg-gray-100" />
                            <div className="space-y-2">{settingsItems}</div>
                          </>
                        )}
                        <div className="h-px bg-gray-100" />
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                            Access
                          </div>
                          {isAdmin || isSuperAdmin ? (
                            <div className="text-xs text-gray-600">Admin access granted.</div>
                          ) : (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={adminRequestName}
                                onChange={(event) => setAdminRequestName(event.target.value)}
                                placeholder="Display name"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                              <input
                                type="email"
                                value={adminRequestEmail}
                                onChange={(event) => setAdminRequestEmail(event.target.value)}
                                placeholder="Email address"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={handleRequestAdmin}
                                className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                Request Admin Access
                              </button>
                            </div>
                          )}
                          {adminRequestMessage ? (
                            <div className={`text-xs ${adminRequestStatus === 'error' ? 'text-rose-600' : 'text-gray-500'}`}>
                              {adminRequestMessage}
                            </div>
                          ) : null}
                        </div>
                        {isAuthenticated && (isAdmin || isSuperAdmin) && (
                          <>
                            <div className="h-px bg-gray-100" />
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                                Admin
                              </div>
                              {isAdmin && (
                                <Link
                                  href="/stats"
                                  className="block rounded-lg px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                >
                                  Stats
                                </Link>
                              )}
                              {isSuperAdmin && (
                                <Link
                                  href="/admin"
                                  className="block rounded-lg px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                >
                                  Admin Users
                                </Link>
                              )}
                            </div>
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
          {displaySubtitle ? (
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 lg:px-0 pt-0">
              <p className="text-[11px] text-gray-400">
                {displaySubtitle}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
