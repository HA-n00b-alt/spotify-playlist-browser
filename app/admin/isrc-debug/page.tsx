import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/analytics'
import PageHeader from '../../components/PageHeader'
import IsrcDebugClient from './IsrcDebugClient'

export const dynamic = 'force-dynamic'

export default async function IsrcDebugPage() {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    redirect('/playlists')
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle="ISRC debug"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'ISRC debug' },
          ]}
        />
        <IsrcDebugClient />
      </div>
    </div>
  )
}
