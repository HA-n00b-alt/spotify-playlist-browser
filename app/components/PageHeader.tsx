'use client'

import Link from 'next/link'
import Image from 'next/image'
import UserMenu from './UserMenu'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from './ThemeProvider'

interface PageHeaderProps {
  subtitle: string
  center?: boolean
  breadcrumbs?: Array<{
    label: string
    href?: string
  }>
  settingsItems?: React.ReactNode
}

type ApiHealthStatus = 'ok' | 'throttled' | 'checking' | 'error'
type ApiHealthEntry = { status: ApiHealthStatus; label: string }

export default function PageHeader({
  subtitle,
  center,
  breadcrumbs,
  settingsItems,
}: PageHeaderProps) {
  const { theme, density, toggleTheme, toggleDensity } = useTheme()
  const [userName, setUserName] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [apiHealth, setApiHealth] = useState<{
    spotify: ApiHealthEntry
    muso: ApiHealthEntry
    musicbrainz: ApiHealthEntry
  }>({
    spotify: { status: 'checking', label: 'Checking' },
    muso: { status: 'checking', label: 'Checking' },
    musicbrainz: { status: 'checking', label: 'Checking' },
  })
  const [requestCounts, setRequestCounts] = useState<{ admin: number; spotify: number } | null>(null)
  const [sentryUrl, setSentryUrl] = useState<string | null>(null)
  const [logLevel, setLogLevel] = useState<string>('info')
  const [isUpdatingLogLevel, setIsUpdatingLogLevel] = useState(false)
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
    if (!isSettingsOpen) return
    let isMounted = true
    fetch('/api/health/services')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return
        setApiHealth({
          spotify: data?.spotify ?? { status: 'error', label: 'Unavailable' },
          muso: data?.muso ?? { status: 'error', label: 'Unavailable' },
          musicbrainz: data?.musicbrainz ?? { status: 'error', label: 'Unavailable' },
        })
      })
      .catch(() => {
        if (!isMounted) return
        setApiHealth({
          spotify: { status: 'error', label: 'Unavailable' },
          muso: { status: 'error', label: 'Unavailable' },
          musicbrainz: { status: 'error', label: 'Unavailable' },
        })
      })
    return () => {
      isMounted = false
    }
  }, [isSettingsOpen])

  useEffect(() => {
    if (!isSettingsOpen || (!isAdmin && !isSuperAdmin)) {
      return
    }
    let isMounted = true
    fetch('/api/admin/request-summary')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return
        setRequestCounts({
          admin: Number(data?.pendingAdminRequests ?? 0),
          spotify: Number(data?.pendingSpotifyAccessRequests ?? 0),
        })
      })
      .catch(() => {
        if (!isMounted) return
        setRequestCounts({ admin: 0, spotify: 0 })
      })
    return () => {
      isMounted = false
    }
  }, [isSettingsOpen, isAdmin, isSuperAdmin])

  useEffect(() => {
    if (!isSettingsOpen || (!isAdmin && !isSuperAdmin)) {
      return
    }
    let isMounted = true
    fetch('/api/admin/observability-settings')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return
        const nextUrl =
          typeof data?.settings?.sentry_dashboard_url === 'string' && data.settings.sentry_dashboard_url.trim()
            ? data.settings.sentry_dashboard_url.trim()
            : null
        setSentryUrl(nextUrl)
        if (typeof data?.settings?.log_level === 'string' && data.settings.log_level.trim()) {
          setLogLevel(data.settings.log_level.trim())
        }
      })
      .catch(() => {
        if (!isMounted) return
        setSentryUrl(null)
      })
    return () => {
      isMounted = false
    }
  }, [isSettingsOpen, isAdmin, isSuperAdmin])

  const healthStatusColor = useMemo<Record<ApiHealthStatus, string>>(
    () => ({
      ok: 'bg-emerald-500',
      throttled: 'bg-amber-400',
      checking: 'bg-amber-400',
      error: 'bg-red-500',
    }),
    []
  )

  // Replace [user] placeholder with actual username if available
  const displaySubtitle = subtitle.includes('[user]') && userName
    ? subtitle.replace('[user]', userName)
    : subtitle
  const playlistsHref = isAuthenticated ? '/playlists' : '/api/auth/login'
  const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)

  const handleLogLevelChange = async (nextLevel: string) => {
    if (!isAdmin && !isSuperAdmin) return
    setIsUpdatingLogLevel(true)
    setLogLevel(nextLevel)
    try {
      await fetch('/api/admin/observability-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_level: nextLevel }),
      })
    } finally {
      setIsUpdatingLogLevel(false)
    }
  }

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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Spotify Playlist Tools</h1>
          <p className="text-sm text-gray-500 mt-1 dark:text-slate-400">{displaySubtitle}</p>
          {/* Back link removed */}
        </div>
      ) : (
        /* Default layout for authenticated pages */
        <div className="relative">
          <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-gray-200/80 bg-white/70 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/80">
            <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 sm:px-8 lg:px-0">
              <nav className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-slate-300">
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
                        className="h-5 w-5 opacity-70 dark:opacity-90"
                      />
                    </button>
                    {isMenuOpen && (
                      <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 text-sm shadow-xl dark:border-slate-800 dark:bg-slate-900">
                        <Link
                          href="/"
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Home
                        </Link>
                        <Link
                          href={playlistsHref}
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Playlists
                        </Link>
                        <Link
                          href="/credits"
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Credit Search
                        </Link>
                        <Link
                          href="/docs"
                          className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Documentation
                        </Link>
                        {(isAdmin || isSuperAdmin) && (
                          <Link
                            href="/admin"
                            className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Admin
                          </Link>
                        )}
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
                          {index > 0 ? <span className="text-gray-300 dark:text-slate-600">/</span> : null}
                          {crumb.href && index < list.length - 1 ? (
                            <Link
                              href={crumb.href}
                              className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                              {label}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{label}</span>
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/70 text-gray-600 shadow-sm transition hover:text-gray-900 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:text-slate-100"
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
                    <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-xl dark:border-slate-800 dark:bg-slate-900/95">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-400">
                            API Health
                          </div>
                          <div className="space-y-2 text-xs text-gray-600 dark:text-slate-300">
                            {([
                              { label: 'Spotify', value: apiHealth.spotify },
                              { label: 'Muso', value: apiHealth.muso },
                              { label: 'MusicBrainz', value: apiHealth.musicbrainz },
                            ] as const).map((entry) => (
                              <div key={entry.label} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${healthStatusColor[entry.value.status]}`} />
                                  <span>{entry.label}</span>
                                </div>
                                <span className="text-[11px] text-gray-400 dark:text-slate-400">{entry.value.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="h-px bg-gray-100 dark:bg-slate-800" />
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-400">
                            Appearance
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-700 dark:text-slate-200">
                            <span>Dark mode</span>
                            <button
                              type="button"
                              onClick={toggleTheme}
                              className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${
                                theme === 'dark' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700'
                              }`}
                              aria-pressed={theme === 'dark'}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                  theme === 'dark' ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-700 dark:text-slate-200">
                            <span>Density</span>
                            <button
                              type="button"
                              onClick={toggleDensity}
                              className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${
                                density === 'compact' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700'
                              }`}
                              aria-pressed={density === 'compact'}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                  density === 'compact' ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {(isAdmin || isSuperAdmin) && (
                          <>
                            <div className="h-px bg-gray-100 dark:bg-slate-800" />
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-400">
                                Requests
                              </div>
                              <div className="space-y-1 text-xs text-gray-600 dark:text-slate-300">
                                <div className="flex items-center justify-between">
                                  <span>Admin access</span>
                                  <span className="font-semibold text-gray-700 dark:text-slate-100">
                                    {requestCounts ? requestCounts.admin : '...'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Spotify API access</span>
                                  <span className="font-semibold text-gray-700 dark:text-slate-100">
                                    {requestCounts ? requestCounts.spotify : '...'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        <div className="h-px bg-gray-100 dark:bg-slate-800" />
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-400">
                            Logging
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-300">
                            <span>Sentry</span>
                            <span className={`font-semibold ${sentryEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>
                              {sentryEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          {(isAdmin || isSuperAdmin) && (
                            <div className="flex items-center justify-between gap-3 text-xs text-gray-600 dark:text-slate-300">
                              <label htmlFor="log-level" className="text-xs text-gray-600 dark:text-slate-300">
                                Log level
                              </label>
                              <select
                                id="log-level"
                                value={logLevel}
                                onChange={(event) => handleLogLevelChange(event.target.value)}
                                disabled={isUpdatingLogLevel}
                                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              >
                                <option value="debug">debug</option>
                                <option value="info">info</option>
                                <option value="warn">warn</option>
                                <option value="error">error</option>
                              </select>
                            </div>
                          )}
                          {sentryUrl && (
                            <Link
                              href={sentryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                            >
                              Open Sentry dashboard {'>'}
                            </Link>
                          )}
                        </div>

                        {settingsItems && (
                          <>
                            <div className="h-px bg-gray-100 dark:bg-slate-800" />
                            <div className="space-y-2">{settingsItems}</div>
                          </>
                        )}
                        <div className="h-px bg-gray-100 dark:bg-slate-800" />
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-400">
                            Access
                          </div>
                          {isAuthenticated && (
                            <div className="text-xs text-gray-600 dark:text-slate-300">
                              Signed in as{' '}
                              <span className="font-semibold text-gray-700 dark:text-slate-100">
                                {userName || adminRequestEmail || 'Spotify user'}
                              </span>
                            </div>
                          )}
                          {isAdmin || isSuperAdmin ? (
                            <div className="text-xs text-gray-600 dark:text-slate-300">Admin access granted.</div>
                          ) : (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={adminRequestName}
                                onChange={(event) => setAdminRequestName(event.target.value)}
                                placeholder="Display name"
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              />
                              <input
                                type="email"
                                value={adminRequestEmail}
                                onChange={(event) => setAdminRequestEmail(event.target.value)}
                                placeholder="Email address"
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              />
                              <button
                                type="button"
                                onClick={handleRequestAdmin}
                                className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                              >
                                Request Admin Access
                              </button>
                            </div>
                          )}
                          {adminRequestMessage ? (
                            <div className={`text-xs ${adminRequestStatus === 'error' ? 'text-rose-600' : 'text-gray-500 dark:text-slate-400'}`}>
                              {adminRequestMessage}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-6 w-px bg-gray-200/80 dark:bg-slate-700/80" />
                <UserMenu />
              </div>
            </div>
          </header>
          <div className="h-16" />
          {displaySubtitle ? (
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 lg:px-0 pt-0">
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                {displaySubtitle}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
