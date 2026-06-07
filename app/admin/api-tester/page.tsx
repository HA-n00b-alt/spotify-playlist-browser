import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/analytics'
import PageHeader from '../../components/PageHeader'
import ApiTesterClient from './ApiTesterClient'

export const dynamic = 'force-dynamic'

export default async function ApiTesterPage() {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    redirect('/playlists')
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle="External API tester"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'External API tester' },
          ]}
        />
        <ApiTesterClient />
      </div>
    </div>
  )
}
