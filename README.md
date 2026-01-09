# Spotify Playlist Tools

A modern Next.js web application that lets you browse, search, and sort your Spotify playlists with ease. Built with TypeScript, featuring a clean, responsive design optimized for both desktop and mobile devices.

**Live Site:** [https://searchmyplaylist.delman.it](https://searchmyplaylist.delman.it)

**Technical Documentation:** See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation on system architecture, error handling, API design, and more.

## Features

### Core Functionality
- **Spotify OAuth Authentication** - Secure login with PKCE (Proof Key for Code Exchange)
- **Playlist Browser** - View all your playlists in a clean, sortable table
- **Track Explorer** - Browse tracks in any playlist with detailed metadata
- **Advanced Search** - Search playlists and tracks by multiple criteria
- **Sorting** - Click column headers to sort by any field
- **Mobile Responsive** - Optimized layouts for phones, tablets, and desktops

### Playlist Page Features
- Display playlists with cover images, names, descriptions, owners, track counts, and followers
- Sort by name, description, owner, tracks, or followers
- Search across all playlist fields
- Clickable owner names linking to Spotify profiles
- Mobile-friendly card view on small screens
- Cache status indicators
- "New" flag for playlists added since last visit
- Refresh button to reload playlists from Spotify

### Track Page Features
- Complete track metadata: name, artists, album, release year, duration, BPM, key, scale, added date
- Album cover thumbnails
- BPM detection with automatic processing indicator
- Musical key and scale detection (e.g., C major, D minor)
- Advanced filtering:
  - Year range (from/to)
  - BPM range (from/to)
  - Include tracks with half/double BPM
- Sort by any column
- Search across all track fields
- Clickable links:
  - Track names → Spotify track page (opens in web player)
  - Artist names → Spotify artist profiles
  - Album names → Spotify album pages
- BPM details modal with source, ISRC, error information, key, scale, and confidence
- Retry functionality for failed BPM calculations
- Playlist header showing playlist info with "Open in Spotify" button
- Mobile-optimized card view

### Technical Features
- Automatic pagination handling for large playlists
- Rate limiting protection with automatic retry
- Token refresh management
- HTML entity decoding for clean text display
- Error handling with user-friendly messages
- BPM detection via external microservice with ISRC-based cross-platform search (Deezer, iTunes)
- Key and scale detection from audio analysis
- Analytics tracking (admin-only)
- Error tracking with Sentry
- API response caching with React Query
- Country-based preview audio search

## Tech Stack

- **Framework:** Next.js 14.2 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Authentication:** Spotify OAuth 2.0 with PKCE
- **Database:** Neon Postgres (for BPM cache, playlist cache, and analytics)
- **BPM Service:** Google Cloud Run microservice
- **Error Tracking:** Sentry
- **Data Fetching:** React Query (TanStack Query)
- **Deployment:** Vercel
- **Image Optimization:** Next.js Image component
- **Package Manager:** pnpm

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- A Spotify Developer account
- A Neon Postgres database
- A Google Cloud service account (for BPM service authentication)
- A Sentry account (for error tracking)
- (Optional) A Vercel account for deployment

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd spotify-playlist-browser
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment variables:**
   
   Create a `.env.local` file in the root directory:
   ```env
   # Spotify OAuth
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   
   # Database (Neon Postgres)
   DATABASE_URL=postgresql://user:password@host/database?sslmode=require
   DATABASE_URL_UNPOOLED=postgresql://user:password@host/database?sslmode=require
   
   # BPM Service
   BPM_SERVICE_URL=https://bpm-service-340051416180.europe-west3.run.app
   GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
   
   # Sentry (Error Tracking)
   NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
   SENTRY_ORG=your-sentry-org
   SENTRY_PROJECT=spotify-playlist-browser
   ```

4. **Set up the database:**
   
   Run the setup script to create all required tables:
   ```bash
   psql $DATABASE_URL_UNPOOLED -f setup.sql
   ```
   
   Or if you have the connection string set:
   ```bash
   export DATABASE_URL_UNPOOLED="postgresql://user:password@host/database?sslmode=require"
   psql $DATABASE_URL_UNPOOLED -f setup.sql
   ```

5. **Configure Spotify App:**
   
   See the [Spotify Setup](#spotify-developer-dashboard-setup) section below for detailed instructions.

6. **Run the development server:**
   ```bash
   pnpm dev
   ```

7. **Open your browser:**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## Spotify Developer Dashboard Setup

### Step 1: Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create app"** and fill in:
   - **App name:** Spotify Playlist Tools (or your preferred name)
   - **App description:** Browse and search Spotify playlists
   - **Website:** `https://searchmyplaylist.delman.it` (or your domain)
   - **Redirect URI:** Leave blank for now

### Step 2: Add Redirect URIs

1. Click **"Edit Settings"** button
2. Scroll to **"Redirect URIs"** section
3. Add the following URIs:
   - `https://searchmyplaylist.delman.it/api/auth/callback` (production)
   - `http://localhost:3000/api/auth/callback` (local development)
4. Click **"Save"**

### Step 3: Get Your Credentials

1. On your app's dashboard page, you'll see:
   - **Client ID:** Copy this value
   - **Client Secret:** Click "Show Client Secret" and copy this value
2. **Keep these secure!** Never commit them to your repository.

### Step 4: Update Environment Variables

Add the credentials to your `.env.local` file (see [Installation](#installation) above).

## Database Setup

The application uses Neon Postgres for BPM caching, playlist caching, and analytics. 

### Fresh Installation

For a fresh installation, run the `setup.sql` script which creates all required tables:

```bash
psql $DATABASE_URL_UNPOOLED -f setup.sql
```

This script creates the following tables:
- `track_bpm_cache` - Stores BPM, key, scale, and related metadata for tracks
- `playlist_cache` - Caches playlist data to reduce Spotify API calls
- `analytics_users` - Tracks unique users and their statistics
- `analytics_pageviews` - Tracks individual page views
- `analytics_api_requests` - Tracks API endpoint requests
- `playlist_order` - Stores custom playlist order (currently unused)


## Environment Variables

### Required Variables

```env
# Spotify OAuth
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://searchmyplaylist.delman.it/api/auth/callback
NEXT_PUBLIC_BASE_URL=https://searchmyplaylist.delman.it

# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:password@host/database?sslmode=require

# BPM Service
BPM_SERVICE_URL=https://bpm-service-340051416180.europe-west3.run.app
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}

# Sentry (Error Tracking)
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=spotify-playlist-browser
```

### Local Development

```env
# Spotify OAuth
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:password@host/database?sslmode=require

# BPM Service
BPM_SERVICE_URL=https://bpm-service-340051416180.europe-west3.run.app
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}

# Sentry (Optional for local development)
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=spotify-playlist-browser
```

### Variable Descriptions

- **SPOTIFY_CLIENT_ID** - Your Spotify app's Client ID from the Developer Dashboard
- **SPOTIFY_CLIENT_SECRET** - Your Spotify app's Client Secret from the Developer Dashboard
- **SPOTIFY_REDIRECT_URI** - The redirect URI configured in your Spotify app (must match exactly)
- **NEXT_PUBLIC_BASE_URL** - Your application's base URL (used for OAuth redirects)
- **DATABASE_URL** - Neon Postgres connection string (pooled connection via PgBouncer)
- **DATABASE_URL_UNPOOLED** - Neon Postgres connection string (direct connection, used for running setup.sql)
- **BPM_SERVICE_URL** - Google Cloud Run service URL for BPM detection (optional, defaults to provided URL)
- **GCP_SERVICE_ACCOUNT_KEY** - Google Cloud service account key JSON (as single-line string) for authenticating with the BPM service
- **NEXT_PUBLIC_SENTRY_DSN** - Sentry DSN for error tracking (public, used in client-side code)
- **SENTRY_ORG** - Sentry organization slug (used during build for source map uploads)
- **SENTRY_PROJECT** - Sentry project slug (used during build for source map uploads)

**Note:** The `GCP_SERVICE_ACCOUNT_KEY` should be the complete JSON object as a single string. In Vercel, you can paste the entire JSON content directly into the environment variable field.

## Deployment

### Vercel Deployment

1. **Push your code to GitHub/GitLab/Bitbucket**

2. **Import project to Vercel:**
   - Go to [Vercel](https://vercel.com)
   - Click "New Project"
   - Import your repository

3. **Configure environment variables:**
   - Go to Project Settings → Environment Variables
   - Add all required variables (see [Environment Variables](#environment-variables))
   - Make sure to select **Production**, **Preview**, and **Development** environments

4. **Configure custom domain:**
   - Go to Project Settings → Domains
   - Add your custom domain (e.g., `searchmyplaylist.delman.it`)
   - Follow Vercel's DNS configuration instructions

5. **Deploy:**
   - Vercel will automatically deploy on every push to your main branch
   - Or click "Deploy" to deploy immediately

### Important Notes

- **Redirect URI must match exactly** - The redirect URI in Spotify dashboard must exactly match the one in your environment variables
- **Use HTTPS in production** - Required for secure cookies
- **Never expose Client Secret** - Keep it in environment variables only
- **Sentry variables are required for production** - Source maps won't upload without `SENTRY_ORG` and `SENTRY_PROJECT`

## Project Structure

```
spotify-playlist-browser/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/          # OAuth initiation
│   │   │   ├── callback/        # OAuth callback handler
│   │   │   ├── logout/          # Logout endpoint
│   │   │   ├── status/          # Auth status check
│   │   │   └── is-admin/        # Check if user is admin
│   │   ├── playlists/
│   │   │   ├── route.ts         # Get all playlists
│   │   │   └── [id]/
│   │   │       ├── route.ts     # Get playlist info
│   │   │       └── tracks/
│   │   │           └── route.ts # Get playlist tracks
│   │   ├── bpm/
│   │   │   ├── route.ts         # Get BPM for single track
│   │   │   └── batch/
│   │   │       └── route.ts     # Get BPM for multiple tracks
│   │   ├── analytics/
│   │   │   ├── track-pageview/  # Track pageview
│   │   │   └── stats/           # Get usage statistics (admin)
│   │   ├── country/
│   │   │   └── route.ts         # Get country from IP/locale
│   │   └── audio-proxy/
│   │       └── route.ts         # Proxy audio preview URLs
│   ├── playlists/
│   │   ├── page.tsx             # Playlists list page
│   │   ├── PlaylistsTable.tsx   # Playlists table component
│   │   └── [id]/
│   │       └── page.tsx         # Tracks page with BPM
│   ├── stats/
│   │   ├── page.tsx             # Analytics dashboard (admin)
│   │   └── StatsClient.tsx      # Stats display component
│   ├── rate-limit/
│   │   └── page.tsx             # Rate limit error page
│   ├── components/
│   │   ├── ErrorBoundary.tsx    # React error boundary
│   │   ├── PageHeader.tsx       # Page header component
│   │   ├── PageViewTracker.tsx  # Client component for pageview tracking
│   │   ├── SkeletonLoader.tsx   # Loading skeleton components
│   │   └── UserMenu.tsx         # User menu component
│   ├── hooks/
│   │   ├── usePlaylist.ts       # React Query hook for playlists
│   │   └── usePlaylistTracks.ts # React Query hook for tracks
│   ├── providers/
│   │   └── QueryProvider.tsx    # React Query provider
│   ├── layout.tsx               # Root layout with footer
│   ├── page.tsx                 # Home/login page
│   ├── global-error.tsx         # Global error handler
│   └── globals.css              # Global styles
├── lib/
│   ├── spotify.ts               # Spotify API client library
│   ├── bpm.ts                   # BPM detection module
│   ├── db.ts                    # Database connection utility
│   ├── analytics.ts             # Analytics tracking utilities
│   ├── errors.ts                # Custom error classes
│   ├── logger.ts                # Centralized logging with Sentry
│   ├── playlists.ts             # Playlist utilities
│   ├── spotify-validation.ts    # Spotify ID validation
│   └── types.ts                 # Shared type definitions
├── setup.sql                    # Database setup script (run once for fresh install)
├── instrument.ts                # Sentry instrumentation (server/edge)
├── instrumentation-client.ts    # Sentry instrumentation (client)
├── next.config.js               # Next.js configuration
├── package.json                 # Dependencies and scripts
└── public/
    ├── favicon-16.png           # Favicon
    ├── favicon-32.png           # Favicon
    ├── apple-touch-180.png      # Apple touch icon
    └── login_picture.png        # Login page image
```

## Pages & Routes

### `/` - Home Page
- Landing page with "Login with Spotify" button
- Auto-redirects to `/playlists` if already authenticated
- Displays error messages if authentication fails

### `/playlists` - Playlists List
- Displays all user playlists in a sortable table
- Features: search, sorting, mobile card view
- Click any playlist to view its tracks

### `/playlists/[id]` - Tracks Page
- Shows playlist header with info and "Open in Spotify" button
- Displays all tracks in a sortable table
- Features: search, advanced filters (year/BPM ranges), audio preview, mobile card view
- Clickable links to Spotify (tracks, artists, albums)

### `/stats` - Analytics Dashboard (Admin Only)
- Displays usage statistics: users, pageviews, API requests
- Accessible only to admin users

## API Routes

### Authentication
- `GET /api/auth/login` - Initiates OAuth flow
- `GET /api/auth/callback` - Handles OAuth callback
- `GET /api/auth/logout` - Clears authentication cookies
- `GET /api/auth/status` - Checks authentication status
- `GET /api/auth/is-admin` - Checks if user is admin

### Playlists
- `GET /api/playlists` - Returns all user playlists
- `GET /api/playlists/[id]` - Returns playlist information
- `GET /api/playlists/[id]/tracks` - Returns all tracks for a playlist

### BPM
- `GET /api/bpm?spotifyTrackId=...&country=...` - Get BPM for a single track
- `POST /api/bpm/batch` - Get BPM for multiple tracks (batch endpoint)

### Analytics (Admin Only)
- `GET /api/analytics/stats` - Get usage statistics (users, requests, pageviews)
- `POST /api/analytics/track-pageview` - Track a pageview

### Country
- `GET /api/country` - Get country code from IP address or browser locale

## Authentication Flow

The application uses Spotify OAuth 2.0 with PKCE (Proof Key for Code Exchange) for enhanced security:

1. **User initiates login** → `/api/auth/login`
   - Generates PKCE code verifier and challenge
   - Stores code verifier in secure httpOnly cookie
   - Redirects to Spotify authorization endpoint

2. **User authorizes** → Spotify redirects to `/api/auth/callback`
   - Extracts authorization code from query params
   - Retrieves code verifier from cookie
   - Exchanges code for access token using PKCE
   - Stores access token and refresh token in secure httpOnly cookies
   - Redirects to `/playlists`

3. **Token refresh** (automatic)
   - When access token expires or is invalid
   - Uses refresh token to get new access token
   - Updates access token cookie automatically

### Security Features
- All cookies are httpOnly (not accessible via JavaScript)
- Cookies use `secure` flag in production (HTTPS only)
- Cookies use `sameSite: 'lax'` to prevent CSRF attacks
- PKCE flow prevents authorization code interception attacks

## Spotify API Scopes

The application requests the following Spotify scopes:
- `playlist-read-private` - Read user's private playlists
- `playlist-read-collaborative` - Read user's collaborative playlists

## Features in Detail

### Search Functionality

**Playlists Page:**
- Search by playlist name, description, owner, track count, or followers
- Real-time filtering as you type

**Tracks Page:**
- Basic search: track name, artist, album, year, or BPM
- Advanced filters:
  - **Year Range:** Filter tracks by release year (from/to/both)
  - **BPM Range:** Filter tracks by tempo (from/to/both)
  - **Half/Double BPM:** Include tracks with half or double the BPM

### Sorting

- Click any column header to sort by that field
- Click again to reverse sort order
- Visual indicators show current sort field and direction (↑/↓)

### BPM Detection

- Automatic BPM calculation for all tracks in a playlist
- Progress indicator shows processing status
- BPM values are clickable to view detailed information (source, ISRC, error, key, scale)
- Retry functionality for failed calculations
- Country selection for preview audio search (iTunes/Deezer)
- ISRC-based cross-platform search for improved accuracy:
  - Deezer ISRC lookup (first choice)
  - iTunes search with ISRC matching
  - Deezer search as fallback
- Key and scale detection from audio analysis

### Mobile Optimization

- **Playlists Page:**
  - Card view on mobile with essential information
  - Table view on larger screens

- **Tracks Page:**
  - Card view on mobile with all track details
  - Table view on larger screens
  - Advanced filters panel optimized for mobile width

## Development

### Available Scripts

```bash
pnpm dev      # Start development server
pnpm build    # Build for production
pnpm start    # Start production server
pnpm lint     # Run ESLint
```

### Code Structure

- **Server Components:** Used for initial data fetching (playlists page)
- **Client Components:** Used for interactive features (search, sorting, audio playback)
- **API Routes:** Server-side endpoints for Spotify API calls
- **Library Functions:** Reusable utilities in `lib/` directory
- **React Query:** Client-side API response caching and state management

## Troubleshooting

### Common Issues

**"Invalid redirect URI" error:**
- Verify the redirect URI in Spotify dashboard exactly matches your environment variable
- Check for trailing slashes or protocol mismatches (http vs https)
- Make sure you clicked "Save" after adding the URI in Spotify dashboard

**"Invalid client" error:**
- Verify your Client ID and Client Secret in environment variables
- Check for extra spaces or characters
- Make sure you're using the correct credentials for your app

**Cookies not working:**
- Ensure your domain is using HTTPS in production
- Check that `NODE_ENV=production` is set in Vercel
- Verify domain configuration in Vercel

**BPM data not showing:**
- BPM is calculated using an external service from preview audio
- Some tracks may not have preview audio available (shows as N/A)
- You can retry failed calculations by clicking on N/A values
- Try selecting a different country in the "more info" panel if previews aren't found
- Check the debug panel (admin only) for detailed URL tracking information

**Large playlists not loading:**
- The app handles pagination automatically
- If a playlist has thousands of tracks, it may take a moment to load
- The app will return partial results if an error occurs during pagination

**Sentry source maps not uploading:**
- Verify `SENTRY_ORG` and `SENTRY_PROJECT` environment variables are set
- Check that your Sentry organization slug and project slug match exactly
- Ensure you have the correct permissions in Sentry

## Contributing

This is a personal project, but suggestions and improvements are welcome!

## License

See [LICENSE](LICENSE) file for details.

## Credits

- **Created by:** delman@delman.it
- **Powered by:** [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- **Built with:** Next.js, React, TypeScript, Tailwind CSS, React Query, Sentry

## Support

For issues or questions, please contact: delman@delman.it

---

**Note:** This application is not affiliated with Spotify. Spotify is a trademark of Spotify AB.
