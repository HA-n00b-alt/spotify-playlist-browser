/**
 * The production deployment manifest. It lives in Vercel Blob only (#13): the deploy no longer
 * mirrors it to `.deploy/manifest.json` or commits it.
 */
const dns = require('node:dns')
const https = require('node:https')
const { head, put } = require('@vercel/blob')
const { loadEnvLocal } = require('./env')

const DEFAULT_MANIFEST_PATHNAME = 'deployment-manifests/spotify-playlist-browser.json'

function loadDeployManifestConfig() {
  const env = loadEnvLocal()
  const config = {
    BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
    pathname: env.DEPLOY_MANIFEST_BLOB_PATH || DEFAULT_MANIFEST_PATHNAME,
  }

  if (!config.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Missing Vercel Blob deploy manifest configuration in .env.local: BLOB_READ_WRITE_TOKEN')
  }

  return config
}

/**
 * A `lookup` for `https.get` that asks DNS for A records only (#49).
 *
 * Vercel's DNS answers NXDOMAIN to HTTPS-record (type 65) queries for `*.public.blob.vercel-storage.com`
 * while the A record exists. macOS `getaddrinfo` asks for both and fails the lookup, so `fetch` and
 * `curl` cannot reach the blob. `dns.resolve4` goes to the DNS server for A records only.
 *
 * @param {typeof dns.resolve4} [resolve4]
 */
function ipv4Lookup(resolve4 = dns.resolve4) {
  return (hostname, options, callback) => {
    resolve4(hostname, (error, addresses) => {
      if (error) return callback(error)
      if (options?.all) return callback(null, addresses.map((address) => ({ address, family: 4 })))
      callback(null, addresses[0], 4)
    })
  }
}

/** GET `url` as text, resolving its host with {@link ipv4Lookup}. */
function getText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { lookup: ipv4Lookup(), headers: { 'cache-control': 'no-cache' } }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch deployment manifest blob: ${response.statusCode} ${response.statusMessage}`))
        } else {
          resolve(body)
        }
      })
    })
    request.on('error', reject)
  })
}

async function readManifest() {
  const config = loadDeployManifestConfig()

  try {
    const blob = await head(config.pathname, {
      token: config.BLOB_READ_WRITE_TOKEN,
    })

    const raw = await getText(blob.url)
    return raw.trim() ? JSON.parse(raw) : { deployments: [] }
  } catch (error) {
    if (
      error?.name === 'BlobNotFoundError' ||
      error?.constructor?.name === 'BlobNotFoundError' ||
      error?.message === 'Vercel Blob: The requested blob does not exist'
    ) {
      return { deployments: [] }
    }

    throw error
  }
}

async function writeManifest(manifest) {
  const config = loadDeployManifestConfig()
  const body = `${JSON.stringify(manifest, null, 2)}\n`

  await put(config.pathname, body, {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
    token: config.BLOB_READ_WRITE_TOKEN,
  })
}

async function appendDeployment(entry) {
  const manifest = await readManifest()
  manifest.deployments = manifest.deployments || []
  manifest.deployments.push(entry)
  await writeManifest(manifest)
  return manifest
}

module.exports = {
  ipv4Lookup,
  readManifest,
  writeManifest,
  appendDeployment,
}
