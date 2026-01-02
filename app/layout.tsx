import type { Metadata } from 'next'
import './globals.css'
import PageViewTracker from './components/PageViewTracker'

export const metadata: Metadata = {
  title: 'Spotify Playlist Browser',
  description: 'Browse and search your Spotify playlists',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
  },
}

function Footer() {
  return (
    <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 border-t border-gray-200">
      Created by{' '}
      <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
        delman@delman.it
      </a>
      . Powered by{' '}
      <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
        Spotify
      </a>
    </footer>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <PageViewTracker />
        {children}
      </body>
    </html>
  )
}

