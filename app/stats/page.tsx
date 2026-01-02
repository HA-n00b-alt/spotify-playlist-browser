import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/analytics'
import StatsClient from './StatsClient'

export default async function StatsPage() {
  // Check if user is admin
  const isAdmin = await isAdminUser()
  
  if (!isAdmin) {
    redirect('/playlists')
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Usage statistics and insights</p>
          </div>
          <a
            href="/playlists"
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors text-sm sm:text-base"
          >
            Back to Playlists
          </a>
        </div>
        
        <StatsClient />
      </div>
    </div>
  )
}


