'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cookie_banner_dismissed'

const EU_COUNTRY_CODES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  'IS','LI','NO','CH','GB',
])

const isEULocale = (locale?: string) => {
  if (!locale) return false
  const parts = locale.split('-')
  const country = parts.length > 1 ? parts[1].toUpperCase() : ''
  return EU_COUNTRY_CODES.has(country)
}

const isEUTz = (tz?: string) => (tz ? tz.startsWith('Europe/') : false)

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = window.localStorage.getItem(STORAGE_KEY)
    if (dismissed) return
    const locale = navigator.language
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (isEULocale(locale) || isEUTz(tz)) {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 px-4 sm:px-8">
      <div className="mx-auto max-w-5xl rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs sm:text-sm text-gray-600">
            This site uses essential cookies for authentication and preferences. By continuing, you agree to their use.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(STORAGE_KEY, '1')
                setVisible(false)
              }}
              className="inline-flex items-center rounded-full bg-[#18B45A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#149A4C]"
            >
              Accept
            </button>
            <a
              href="mailto:delman@delman.it"
              className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
