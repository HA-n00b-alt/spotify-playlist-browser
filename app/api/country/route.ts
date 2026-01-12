import { NextResponse } from 'next/server'
import { logError, logWarning, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Get country code from IP address or Accept-Language header
 */
export const GET = withApiLogging(async (request: Request) => {
  try {
    // Try to get country from IP address first
    const forwarded = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const ip = forwarded?.split(',')[0] || realIp || ''

    let countryCode = 'us' // Default

    if (ip) {
      try {
        // Use a free IP geolocation service
        // Note: In production, you might want to use a more reliable service
        const response = await fetch(`https://ipapi.co/${ip}/country_code/`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        if (response.ok) {
          const country = await response.text()
          if (country && country.length === 2) {
            countryCode = country.toLowerCase()
          }
        }
      } catch (error) {
        logWarning('Country lookup by IP failed', {
          component: 'api.country',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Fallback to Accept-Language header
    if (countryCode === 'us') {
      const acceptLanguage = request.headers.get('accept-language')
      if (acceptLanguage) {
        const languages = acceptLanguage.split(',')
        for (const lang of languages) {
          const parts = lang.split(';')[0].trim().toLowerCase()
          const langToCountry: Record<string, string> = {
            'en-us': 'us',
            'en-gb': 'gb',
            'en': 'us',
            'it': 'it',
            'it-it': 'it',
            'fr': 'fr',
            'fr-fr': 'fr',
            'de': 'de',
            'de-de': 'de',
            'es': 'es',
            'es-es': 'es',
            'ja': 'jp',
            'ja-jp': 'jp',
          }
          if (langToCountry[parts]) {
            countryCode = langToCountry[parts]
            break
          }
          const countryMatch = parts.match(/-([a-z]{2})$/)
          if (countryMatch) {
            countryCode = countryMatch[1]
            break
          }
        }
      }
    }

    return NextResponse.json({ countryCode })
  } catch (error) {
    logError(error, { component: 'api.country' })
    return NextResponse.json({ countryCode: 'us' }, { status: 200 })
  }
})
