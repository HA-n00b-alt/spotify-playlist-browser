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

  if (!user) {
    return null
  }

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
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => !isOpen && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-sm hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-sm"
        aria-label={user.display_name || 'User menu'}
        aria-expanded={isOpen}
      >
        {getInitial(user.display_name || user.id)}
      </button>

      {/* Tooltip on hover (only when menu is closed) */}
      {showTooltip && !isOpen && (
        <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none animate-fade-in">
          {user.display_name || user.id}
          <div className="absolute -top-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
        </div>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-50 animate-fade-in">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user.display_name || user.id}
            </p>
            {user.email && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{user.email}</p>
            )}
          </div>
          <div className="py-1">
            <button
              onClick={handleOpenSpotify}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center"
            >
              Open Spotify
            </button>
            <button
              onClick={handleOpenWebPlayer}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center"
            >
              Open Web Player
            </button>
          </div>
          <div className="border-t border-gray-200 py-1">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

