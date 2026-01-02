/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.scdn.co',
      },
      {
        protocol: 'https',
        hostname: '**.spotifycdn.com',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ensure ffmpeg-static binary is included in serverless bundle
      config.externals = config.externals || []
      // Don't externalize ffmpeg-static - we need the binary
    }
    return config
  },
}

module.exports = nextConfig

