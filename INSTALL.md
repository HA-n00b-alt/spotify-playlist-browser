# Installation Guide

This guide provides step-by-step instructions for setting up a fresh installation of Spotify Playlist Tools.

## Prerequisites

Before you begin, ensure you have:

1. **Node.js 18+** and **pnpm** installed
   ```bash
   # Install pnpm if not already installed
   npm install -g pnpm
   ```

2. **A Spotify Developer account** - Sign up at [developer.spotify.com](https://developer.spotify.com)

3. **A Neon Postgres database** - Sign up at [neon.tech](https://neon.tech)

4. **A Google Cloud service account** - For BPM service authentication

5. **A Sentry account** (optional but recommended) - Sign up at [sentry.io](https://sentry.io)

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd spotify-playlist-browser
```

## Step 2: Install Dependencies

```bash
pnpm install
```

## Step 3: Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local  # If you have an example file
# Or create it manually
```

Add the following environment variables to `.env.local`:

```env
# Spotify OAuth (Required)
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Database (Required)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:password@host/database?sslmode=require

# BPM Service (Required)
BPM_SERVICE_URL=https://bpm-service-340051416180.europe-west3.run.app
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}

# Sentry (Optional but Recommended)
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=spotify-playlist-browser
```

### Getting Your Spotify Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create app"
3. Fill in the app details:
   - **App name:** Your app name
   - **App description:** Browse and search Spotify playlists
   - **Website:** Your website URL (or leave blank for now)
4. Click "Save"
5. Copy your **Client ID** and **Client Secret**
6. Click "Edit Settings"
7. Add redirect URI: `http://localhost:3000/api/auth/callback`
8. Click "Save"

### Setting Up Neon Database

1. Go to [neon.tech](https://neon.tech) and create an account
2. Create a new project
3. Copy the connection strings:
   - **Connection string** (for `DATABASE_URL`) - This is the pooled connection
   - **Connection string (unpooled)** (for `DATABASE_URL_UNPOOLED`) - This is the direct connection
4. Add both to your `.env.local` file

### Setting Up Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Cloud Run API
4. Create a service account:
   - Go to "IAM & Admin" → "Service Accounts"
   - Click "Create Service Account"
   - Give it a name and grant it the "Cloud Run Invoker" role
5. Create a key:
   - Click on the service account
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Select JSON format
   - Download the key file
6. Copy the entire JSON content and paste it as a single line in `GCP_SERVICE_ACCOUNT_KEY` (remove newlines)

### Setting Up Sentry (Optional)

1. Go to [sentry.io](https://sentry.io) and create an account
2. Create a new project (select Next.js)
3. Copy your DSN (it looks like `https://xxx@sentry.io/xxx`)
4. Note your organization slug (from the URL: `sentry.io/organizations/{slug}/`)
5. Note your project slug (from project settings)
6. Add all three values to your `.env.local` file

## Step 4: Set Up the Database

Run the setup script to create all required tables:

```bash
psql $DATABASE_URL_UNPOOLED -f setup.sql
```

Or if you need to set the connection string first:

```bash
export DATABASE_URL_UNPOOLED="postgresql://user:password@host/database?sslmode=require"
psql $DATABASE_URL_UNPOOLED -f setup.sql
```

**Note:** Make sure you're using the `DATABASE_URL_UNPOOLED` connection string (direct connection), not the pooled one.

## Step 5: Run the Development Server

```bash
pnpm dev
```

The application should now be running at [http://localhost:3000](http://localhost:3000)

## Step 6: Test the Application

1. Open [http://localhost:3000](http://localhost:3000) in your browser
2. Click "Login with Spotify"
3. Authorize the application
4. You should be redirected to the playlists page

## Troubleshooting

### Database Connection Issues

- Verify your connection strings are correct
- Make sure you're using `DATABASE_URL_UNPOOLED` for the setup script
- Check that your IP is allowed in Neon (if required)
- Ensure SSL mode is set to `require`

### Spotify OAuth Issues

- Verify your Client ID and Client Secret are correct
- Check that the redirect URI matches exactly (no trailing slashes)
- Make sure you saved the redirect URI in Spotify dashboard
- Clear browser cookies if you're getting redirect errors

### BPM Service Issues

- Verify your GCP service account key is valid JSON
- Check that the service account has the "Cloud Run Invoker" role
- Ensure the BPM service URL is correct
- Check Google Cloud Console for service account permissions

### Sentry Issues

- Verify your DSN is correct (must start with `https://`)
- Check that `SENTRY_ORG` matches your organization slug exactly
- Verify `SENTRY_PROJECT` matches your project slug exactly
- Source maps won't upload without correct org/project values

## Next Steps

- Read the [README.md](README.md) for more information about features and usage
- See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment instructions (if applicable)
- Configure admin users in your database for analytics access

