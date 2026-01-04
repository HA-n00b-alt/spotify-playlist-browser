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
}

export default function PageHeader({ subtitle, backLink, rightButtons }: PageHeaderProps) {
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Spotify Playlist Tools</h1>
          <p className="text-sm text-gray-500 mt-1">{displaySubtitle}</p>
        </div>
        <div className="flex gap-2 items-center">
          {rightButtons}
          <UserMenu />
        </div>
      </div>
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



