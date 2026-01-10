import PageHeader from '../components/PageHeader'

export const dynamic = 'force-dynamic'

export default function DocumentationPage() {
  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle=""
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Documentation' },
          ]}
        />
        <div className="rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 sm:p-10">
          <div className="space-y-6 text-sm text-gray-600">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-[#171923]">Overview</h2>
              <p>
                Spotify Playlist Tools helps you browse playlists, inspect BPM/key, and view credits in a clean, modern interface.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#171923]">Key Features</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Search and sort playlists and tracks.</li>
                <li>Filter by BPM, year, and popularity.</li>
                <li>View BPM/key details with sources.</li>
                <li>Open tracks, artists, and playlists in Spotify.</li>
                <li>Fetch song credits (producer, writer, mixer, mastering).</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#171923]">How to Use</h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Sign in with Spotify.</li>
                <li>Select a playlist from the list view.</li>
                <li>Use the search bar and filters to refine results.</li>
                <li>Click BPM or Key to open details.</li>
                <li>Use the track menu for Spotify links or credits.</li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#171923]">Access & Privacy</h3>
              <p>
                Due to Spotify API access policies, this app is available only to a small group of authorized users.
                Request access at <a href="mailto:delman@delman.it" className="text-emerald-600 hover:text-emerald-700 underline">delman@delman.it</a>.
              </p>
              <p>
                Spotify login is used only to fetch playlists. BPM/key results are cached per track for performance.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#171923]">Processing & Credits</h3>
              <p>
                New playlists or newly added tracks may take a few minutes to fully populate while BPM/key calculations run in the background.
              </p>
              <p>
                Credits are retrieved from MusicBrainz today, and may be incomplete or missing. Additional credit sources will be added in the future.
              </p>
            </div>
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
        </a>{' '}and{' '}
        <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Musicbrainz
        </a>
        .
      </footer>
    </div>
  )
}
