import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import PageViewTracker from './components/PageViewTracker'
import { ErrorBoundary } from './components/ErrorBoundary'
import { QueryProvider } from './providers/QueryProvider'
import CookieBanner from './components/CookieBanner'
import { ThemeProvider } from './components/ThemeProvider'

export const metadata: Metadata = {
  title: 'Spotify Playlist Browser',
  description: 'Browse and search your Spotify playlists',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon-32.png',
    apple: '/apple-touch-180.png',
  },
}

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

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
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex min-h-screen flex-col text-slate-900 antialiased dark:text-slate-100`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}var den=localStorage.getItem('density');if(den==='compact'){document.documentElement.classList.add('density-compact');}}catch(e){}})();`,
          }}
        />
        <ErrorBoundary>
          <QueryProvider>
            <ThemeProvider>
              <PageViewTracker />
              {children}
              <CookieBanner />
              <SpeedInsights />
            </ThemeProvider>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
