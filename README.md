# Spotify Playlist Tools

A modern Next.js web application that lets you browse, search, and sort your Spotify playlists with ease. Built with TypeScript, featuring a clean, responsive design optimized for both desktop and mobile devices.

**Live Site:** [https://searchmyplaylist.delman.it](https://searchmyplaylist.delman.it)

## Features

### Core Functionality
- ✅ **Spotify OAuth Authentication** - Secure login with PKCE (Proof Key for Code Exchange)
- ✅ **Playlist Browser** - View all your playlists in a clean, sortable table
- ✅ **Track Explorer** - Browse tracks in any playlist with detailed metadata
- ✅ **Advanced Search** - Search playlists and tracks by multiple criteria
- ✅ **Sorting** - Click column headers to sort by any field
- ✅ **Mobile Responsive** - Optimized layouts for phones, tablets, and desktops

### Playlist Page Features
- Display playlists with cover images, names, descriptions, owners, track counts, and followers
- Sort by name, description, owner, tracks, or followers
- Search across all playlist fields
- Clickable owner names linking to Spotify profiles
- Mobile-friendly card view on small screens

### Track Page Features
- Complete track metadata: name, artists, album, release year, duration, BPM, added date
- Album cover thumbnails
- 30-second audio preview playback (click track row)
- Advanced filtering:
  - Year range (from/to)
  - BPM range (from/to)
- Sort by any column
- Search across all track fields
- Clickable links:
  - Track names → Spotify track page
  - Artist names → Spotify artist profiles
  - Album names → Spotify album pages
- Playlist header showing playlist info with "Open in Spotify" button
- Mobile-optimized card view

### Technical Features
- Automatic pagination handling for large playlists
- Rate limiting protection with automatic retry
- Token refresh management
- HTML entity decoding for clean text display
- Error handling with user-friendly messages

## Tech Stack

- **Framework:** Next.js 14.2 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Authentication:** Spotify OAuth 2.0 with PKCE
- **Deployment:** Vercel
- **Image Optimization:** Next.js Image component

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Spotify Developer account
- (Optional) A Vercel account for deployment

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd spotify-playlist-browser
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   
   Create a `.env.local` file in the root directory:
   ```env
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

4. **Configure Spotify App:**
   
   See the [Spotify Setup](#spotify-developer-dashboard-setup) section below for detailed instructions.

5. **Run the development server:**
   ```bash
   npm run dev
   ```

6. **Open your browser:**
   
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
2. ⚠️ **Keep these secure!** Never commit them to your repository.

### Step 4: Update Environment Variables

Add the credentials to your `.env.local` file (see [Installation](#installation) above).

## Project Structure

```
spotify-playlist-browser/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/          # OAuth initiation
│   │   │   ├── callback/        # OAuth callback handler
│   │   │   ├── logout/          # Logout endpoint
│   │   │   └── status/          # Auth status check
│   │   ├── playlists/
│   │   │   ├── route.ts         # Get all playlists
│   │   │   └── [id]/
│   │   │       ├── route.ts     # Get playlist info
│   │   │       └── tracks/
│   │   │           └── route.ts # Get playlist tracks
│   │   └── debug/
│   │       └── audio-features/  # Debug endpoint for BPM data
│   ├── playlists/
│   │   ├── page.tsx             # Playlists list page
│   │   ├── PlaylistsTable.tsx   # Playlists table component
│   │   └── [id]/
│   │       └── page.tsx         # Tracks page
│   ├── layout.tsx               # Root layout with footer
│   ├── page.tsx                 # Home/login page
│   └── globals.css              # Global styles
├── lib/
│   └── spotify.ts               # Spotify API client library
├── public/
│   ├── favicon-16x16.png        # Favicon
│   └── favicon-32x32.png        # Favicon
└── package.json
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

## API Routes

### Authentication
- `GET /api/auth/login` - Initiates OAuth flow
- `GET /api/auth/callback` - Handles OAuth callback
- `GET /api/auth/logout` - Clears authentication cookies
- `GET /api/auth/status` - Checks authentication status

### Playlists
- `GET /api/playlists` - Returns all user playlists
- `GET /api/playlists/[id]` - Returns playlist information
- `GET /api/playlists/[id]/tracks` - Returns all tracks for a playlist

### Debug
- `GET /api/debug/audio-features?playlistId=[id]` - Debug endpoint for audio features API

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

## Environment Variables

### Required Variables

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://searchmyplaylist.delman.it/api/auth/callback
NEXT_PUBLIC_BASE_URL=https://searchmyplaylist.delman.it
```

### Local Development

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

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

### Sorting

- Click any column header to sort by that field
- Click again to reverse sort order
- Visual indicators show current sort field and direction (↑/↓)

### Audio Preview

- Click on any track row to play a 30-second preview
- Visual indicator shows which track is currently playing
- Click again to pause
- Automatically stops when another track starts

### Mobile Optimization

- **Playlists Page:**
  - Card view on mobile with essential information
  - Table view on larger screens

- **Tracks Page:**
  - Card view on mobile with all track details
  - Table view on larger screens
  - Advanced filters panel optimized for mobile width
  - "Link" column hidden on mobile (track title is clickable instead)

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
- BPM data availability depends on when your Spotify app was created
- Apps created before November 2024 may have access to audio features
- Use the debug panel (click "Show Debug Info") to check API responses

**Large playlists not loading:**
- The app handles pagination automatically
- If a playlist has thousands of tracks, it may take a moment to load
- The app will return partial results if an error occurs during pagination

## Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

### Code Structure

- **Server Components:** Used for initial data fetching (playlists page)
- **Client Components:** Used for interactive features (search, sorting, audio playback)
- **API Routes:** Server-side endpoints for Spotify API calls
- **Library Functions:** Reusable Spotify API client in `lib/spotify.ts`

## Contributing

This is a personal project, but suggestions and improvements are welcome!

## License

See [LICENSE](LICENSE) file for details.

## Credits

- **Created by:** delman@delman.it
- **Powered by:** [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- **Built with:** Next.js, React, TypeScript, Tailwind CSS

## Support

For issues or questions, please contact: delman@delman.it

---

**Note:** This application is not affiliated with Spotify. Spotify is a trademark of Spotify AB.
