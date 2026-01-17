'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface UserInfo {
  id: string
  display_name: string
  email?: string
}

export default function UserMenu() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    // Fetch user info
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user)
        }
      })
      .catch((err) => {
        console.error('Error fetching user info:', err)
      })
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const isAuthenticated = Boolean(user)

  const getInitial = (name: string): string => {
    if (!name) return '?'
    // Get first letter of first word, or first letter if single word
    const parts = name.trim().split(/\s+/)
    return parts[0][0].toUpperCase()
  }

  const handleLogout = async () => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/logout'
    document.body.appendChild(form)
    form.submit()
  }

  const handleLogin = () => {
    router.push('/api/auth/login')
  }

  const handleOpenSpotify = () => {
    window.open('https://open.spotify.com', '_blank')
  }

  const handleOpenWebPlayer = () => {
    window.open('https://open.spotify.com', '_blank')
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => (isAuthenticated ? setIsOpen(!isOpen) : handleLogin())}
        onMouseEnter={() => !isOpen && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm shadow-sm transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isAuthenticated
            ? 'bg-gradient-to-br from-green-400 to-green-600 text-white hover:scale-105 focus:ring-green-500'
            : 'bg-white text-gray-500 border border-gray-200 hover:scale-105 focus:ring-gray-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
        }`}
        aria-label={isAuthenticated ? (user?.display_name || 'User menu') : 'Login with Spotify'}
        aria-expanded={isOpen}
      >
        {isAuthenticated ? (
          getInitial(user?.display_name || user?.id || '')
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 11V8a4 4 0 1 1 8 0v3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="5" y="11" width="14" height="9" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Tooltip on hover (only when menu is closed) */}
      {showTooltip && !isOpen && (
        <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none animate-fade-in">
          {isAuthenticated ? (user?.display_name || user?.id) : 'Login with Spotify'}
          <div className="absolute -top-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
        </div>
      )}

      {/* Dropdown menu */}
      {isOpen && isAuthenticated && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-50 animate-fade-in dark:bg-slate-900 dark:border-slate-800">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800">
            <p className="text-sm font-semibold text-gray-900 truncate dark:text-slate-100">
              {user?.display_name || user?.id}
            </p>
            {user?.email && (
              <p className="text-xs text-gray-500 truncate mt-0.5 dark:text-slate-400">{user.email}</p>
            )}
          </div>
          <div className="py-1">
            <button
              onClick={handleOpenSpotify}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Open Spotify
            </button>
            <button
              onClick={handleOpenWebPlayer}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Open Web Player
            </button>
          </div>
          <div className="border-t border-gray-200 py-1 dark:border-slate-800">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
