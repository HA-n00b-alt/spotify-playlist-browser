import Link from 'next/link'
import PageHeader from '../components/PageHeader'
import CreditsSearchClient from './CreditsSearchClient'
import { getAccessToken } from '@/lib/spotify'

export const dynamic = 'force-dynamic'

export default async function CreditsSearchPage() {
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return (
      <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
        <div className="max-w-7xl mx-auto flex-1 w-full">
          <PageHeader subtitle="Search and sort your playlists with ease" center />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-4">Please log in</h1>
              <Link
                href="/api/auth/login"
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-full"
              >
                Login with Spotify
              </Link>
            </div>
          </div>
        </div>
        <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 border-t border-gray-200">
          Created by{' '}
          <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
            delman@delman.it
          </a>
          . Powered by{' '}
          <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            Spotify
          </a>
          .
        </footer>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle="MusicBrainz credits search"
          breadcrumbs={[{ label: 'Credit Search' }]}
        />
        <CreditsSearchClient />
      </div>
      <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 border-t border-gray-200">
        Created by{' '}
        <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
          delman@delman.it
        </a>
        . Powered by{' '}
        <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Spotify
        </a>
        .
      </footer>
    </div>
  )
}
