import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Spotify Playlist Browser',
  description: 'Browse and search your Spotify playlists',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

