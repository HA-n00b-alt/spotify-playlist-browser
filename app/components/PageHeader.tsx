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
                <div className="flex-shrink-0 ml-4">
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



