const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { head, put } = require('@vercel/blob')
const { ROOT, loadEnvLocal } = require('./env')

const DEPLOY_DIR = path.join(ROOT, '.deploy')
const MANIFEST_PATH = path.join(DEPLOY_DIR, 'manifest.json')
const DEFAULT_MANIFEST_PATHNAME = 'deployment-manifests/spotify-playlist-browser.json'

function ensureDeployDir() {
  fs.mkdirSync(DEPLOY_DIR, { recursive: true })
}

function readLocalManifest() {
  ensureDeployDir()
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { deployments: [] }
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
}

function writeLocalManifest(manifest) {
  ensureDeployDir()
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
}

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
    const manifest = raw.trim() ? JSON.parse(raw) : { deployments: [] }
    writeLocalManifest(manifest)
    return manifest
  } catch (error) {
    if (
      error?.name === 'BlobNotFoundError' ||
      error?.constructor?.name === 'BlobNotFoundError' ||
      error?.message === 'Vercel Blob: The requested blob does not exist'
    ) {
      const manifest = { deployments: [] }
      writeLocalManifest(manifest)
      return manifest
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

  writeLocalManifest(manifest)
}

async function appendDeployment(entry) {
  const manifest = await readManifest()
  manifest.deployments = manifest.deployments || []
  manifest.deployments.push(entry)
  await writeManifest(manifest)
  return manifest
}

function gitTreeHash() {
  const { execSync } = require('node:child_process')
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function workingTreeHash() {
  const { execSync } = require('node:child_process')
  try {
    const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim()
    return crypto.createHash('sha256').update(status).digest('hex').slice(0, 12)
  } catch {
    return 'unknown'
  }
}

module.exports = {
  DEPLOY_DIR,
  MANIFEST_PATH,
  readManifest,
  writeManifest,
  appendDeployment,
  gitTreeHash,
  workingTreeHash,
}
