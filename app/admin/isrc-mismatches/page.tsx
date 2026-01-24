import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/analytics'
import PageHeader from '../../components/PageHeader'
import IsrcMismatchClient from './IsrcMismatchClient'

export const dynamic = 'force-dynamic'

export default async function IsrcMismatchPage() {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    redirect('/playlists')
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle="ISRC mismatch review"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'ISRC Mismatches' },
          ]}
        />
        <IsrcMismatchClient />
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
        ,{' '}
        <a href="https://muso.ai" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Muso.ai
        </a>{' '}
        and{' '}
        <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          MusicBrainz
        </a>
        .
      </footer>
    </div>
  )
}
