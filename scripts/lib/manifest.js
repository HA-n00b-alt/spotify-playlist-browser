/**
 * The production deployment manifest. It lives in Vercel Blob only (#13): the deploy no longer
 * mirrors it to `.deploy/manifest.json` or commits it.
 */
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

async function readManifest() {
  const config = loadDeployManifestConfig()

  try {
    const blob = await head(config.pathname, {
      token: config.BLOB_READ_WRITE_TOKEN,
    })

    const response = await fetch(blob.url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Failed to fetch deployment manifest blob: ${response.status} ${response.statusText}`)
    }

    const raw = await response.text()
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
  readManifest,
  writeManifest,
  appendDeployment,
}
