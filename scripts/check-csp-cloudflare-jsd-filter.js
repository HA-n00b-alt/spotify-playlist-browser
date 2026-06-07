#!/usr/bin/env node
/**
 * Cloudflare JSD CSP filter check — N/A for Vercel-only deployments.
 * Passes when the project is deployed via Vercel (no Cloudflare Pages/Workers config).
 */
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./lib/env')

function main() {
  const wranglerPath = path.join(ROOT, 'wrangler.toml')
  const hasWrangler = fs.existsSync(wranglerPath)

  if (hasWrangler) {
    console.error(
      'check:csp-cloudflare-jsd-filter failed: wrangler.toml present but CSP filter script not configured'
    )
    process.exit(1)
  }

  console.log('check:csp-cloudflare-jsd-filter passed (Vercel-only project — no Cloudflare CSP filter required)')
}

main()
