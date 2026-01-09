import PageHeader from '../components/PageHeader'

export const dynamic = 'force-dynamic'

export default function DocumentationPage() {
  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader subtitle="Documentation" breadcrumbs={[{ label: 'Documentation' }]} />
        <div className="rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 sm:p-10">
          <div className="max-w-2xl space-y-3 text-sm text-gray-600">
            <h2 className="text-lg font-semibold text-[#171923]">Getting Started</h2>
            <p>
              Documentation is coming soon. This page will cover login, playlist browsing, BPM/key insights, and credits lookup.
            </p>
            <p className="text-xs text-gray-500">
              If you need immediate help, email <a href="mailto:delman@delman.it" className="text-emerald-600 hover:text-emerald-700 underline">delman@delman.it</a>.
            </p>
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
