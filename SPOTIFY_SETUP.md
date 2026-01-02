# Spotify Developer Dashboard Setup

## Quick Setup Checklist

Follow these steps to configure your Spotify app for `searchmyplaylist.delman.it`:

### Step 1: Access Spotify Developer Dashboard
1. Go to https://developer.spotify.com/dashboard
2. Log in with your Spotify account

### Step 2: Select or Create Your App
- If you already have an app, click on it
- If not, click "Create app" and fill in:
  - **App name**: Spotify Playlist Browser (or your preferred name)
  - **App description**: Browse and search Spotify playlists
  - **Website**: `https://searchmyplaylist.delman.it`
  - **Redirect URI**: Leave blank for now (we'll add it in the next step)

### Step 3: Add Redirect URIs
1. Click **"Edit Settings"** button
2. Scroll to **"Redirect URIs"** section
3. Click **"Add"** and enter:
   ```
   https://searchmyplaylist.delman.it/api/auth/callback
   ```
4. Click **"Add"** again and enter (for local development):
   ```
   http://localhost:3000/api/auth/callback
   ```
5. Click **"Save"** at the bottom

### Step 4: Get Your Credentials
1. On your app's dashboard page, you'll see:
   - **Client ID**: Copy this value
   - **Client Secret**: Click "Show Client Secret" and copy this value
2. ⚠️ **Keep these secure!** Never commit them to your repository.

### Step 5: Update Vercel Environment Variables
1. Go to your Vercel project
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

| Variable | Value |
|----------|-------|
| `SPOTIFY_CLIENT_ID` | Your Client ID from Step 4 |
| `SPOTIFY_CLIENT_SECRET` | Your Client Secret from Step 4 |
| `SPOTIFY_REDIRECT_URI` | `https://searchmyplaylist.delman.it/api/auth/callback` |
| `NEXT_PUBLIC_BASE_URL` | `https://searchmyplaylist.delman.it` |
| `NODE_ENV` | `production` |

4. Make sure to select **Production**, **Preview**, and **Development** environments
5. Click **Save**

## Important Notes

### Redirect URI Must Match Exactly
- The redirect URI in Spotify **must exactly match** the one in your environment variables
- Spotify is case-sensitive
- Include the full path: `/api/auth/callback`
- Use `https://` (not `http://`) for production

### Common Mistakes to Avoid
❌ **Don't** add a trailing slash: `https://searchmyplaylist.delman.it/api/auth/callback/`
❌ **Don't** use `http://` instead of `https://` for production
❌ **Don't** forget to click "Save" after adding redirect URIs
❌ **Don't** expose your Client Secret in client-side code

### Testing
After configuration:
1. Deploy your app to Vercel
2. Visit `https://searchmyplaylist.delman.it`
3. Click "Login with Spotify"
4. You should be redirected to Spotify for authorization
5. After authorizing, you'll be redirected back to your app

### Troubleshooting

**Error: "Invalid redirect URI"**
- Double-check the redirect URI in Spotify dashboard matches exactly
- Verify it's using `https://` (not `http://`)
- Make sure you clicked "Save" after adding the URI

**Error: "Invalid client"**
- Verify your Client ID and Client Secret in Vercel
- Check for extra spaces or characters
- Make sure you're using the correct credentials for your app

## Screenshot Locations

When editing settings in Spotify Dashboard, you'll find:
- **Redirect URIs**: Under "App settings" → "Redirect URIs" section
- **Client ID**: On the main app dashboard page
- **Client Secret**: On the main app dashboard page (click "Show Client Secret")

