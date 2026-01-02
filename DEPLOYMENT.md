# Deployment Guide

## Production Domain
**Domain:** `searchmyplaylist.delman.it`

## Vercel Configuration

### Environment Variables
Set the following environment variables in your Vercel project settings:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://searchmyplaylist.delman.it/api/auth/callback
NEXT_PUBLIC_BASE_URL=https://searchmyplaylist.delman.it
NODE_ENV=production
```

### Domain Setup
1. Go to your Vercel project settings
2. Navigate to "Domains"
3. Add `searchmyplaylist.delman.it` as a custom domain
4. Follow Vercel's instructions to configure DNS records

## Spotify Developer Dashboard Configuration

### Required Steps

1. **Go to Spotify Developer Dashboard**
   - Visit: https://developer.spotify.com/dashboard
   - Log in with your Spotify account

2. **Select Your App**
   - Click on your app (or create a new one if needed)

3. **Add Redirect URIs**
   - Click "Edit Settings"
   - In the "Redirect URIs" section, add:
     - `https://searchmyplaylist.delman.it/api/auth/callback` (production)
     - `http://localhost:3000/api/auth/callback` (for local development/testing)
   - Click "Add"
   - Click "Save"

4. **Verify App Settings**
   - **App name**: Your app name
   - **App description**: Description of your app
   - **Website**: `https://searchmyplaylist.delman.it`
   - **Redirect URIs**: Must include `https://searchmyplaylist.delman.it/api/auth/callback`

5. **Get Your Credentials**
   - **Client ID**: Copy this to your Vercel environment variables
   - **Client Secret**: Click "Show Client Secret" and copy to Vercel environment variables
   - ⚠️ **Never commit these to your repository!**

## Important Notes

### Redirect URI Requirements
- The redirect URI in your Spotify app settings **must exactly match** the one in your environment variables
- Spotify is case-sensitive and requires exact URL matching
- Both HTTP and HTTPS versions are considered different URIs
- Include the full path: `/api/auth/callback`

### Security
- Use HTTPS in production (required for secure cookies)
- The `secure` flag on cookies is automatically enabled when `NODE_ENV=production`
- Never expose your Client Secret in client-side code

### Testing
After deployment:
1. Visit `https://searchmyplaylist.delman.it`
2. Click "Login with Spotify"
3. You should be redirected to Spotify for authorization
4. After authorizing, you should be redirected back to your app

### Troubleshooting

**"Invalid redirect URI" error:**
- Verify the redirect URI in Spotify dashboard exactly matches your environment variable
- Check for trailing slashes or protocol mismatches (http vs https)

**"Invalid client" error:**
- Verify your Client ID and Client Secret in Vercel environment variables
- Make sure there are no extra spaces or characters

**Cookies not working:**
- Ensure your domain is using HTTPS
- Check that `NODE_ENV=production` is set in Vercel
- Verify domain configuration in Vercel

## Local Development

For local development, use:
```env
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Make sure `http://localhost:3000/api/auth/callback` is also added to your Spotify app's redirect URIs.

