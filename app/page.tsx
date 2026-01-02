import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">Spotify Playlist Browser</h1>
        <Link
          href="/api/auth/login"
          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-full transition-colors"
        >
          Login with Spotify
        </Link>
      </div>
    </main>
  )
}

