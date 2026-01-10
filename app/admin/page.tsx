import { redirect } from 'next/navigation'
import { isSuperAdminUser } from '@/lib/analytics'
import PageHeader from '../components/PageHeader'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    redirect('/')
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader subtitle="" breadcrumbs={[{ label: 'Admin' }]} />
        <AdminClient />
      </div>
      <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 border-t border-gray-200">
        Created by{' '}
        <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
          delman@delman.it
        </a>
        . Powered by{' '}
        <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Spotify
        </a>{' '}and{' '}
        <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Musicbrainz
        </a>
        .
      </footer>
    </div>
  )
}
