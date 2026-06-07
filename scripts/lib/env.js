const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const ENV_LOCAL = path.join(ROOT, '.env.local')
const ENV_EXAMPLE = path.join(ROOT, '.env.example')

function parseEnvFile(content) {
  const env = {}
  let index = 0

  while (index < content.length) {
    while (index < content.length && (content[index] === '\n' || content[index] === '\r')) {
      index += 1
    }
    if (index >= content.length) break

    if (content[index] === '#') {
      while (index < content.length && content[index] !== '\n') index += 1
      continue
    }

    const keyStart = index
    while (index < content.length && content[index] !== '=' && content[index] !== '\n') {
      index += 1
    }
    if (index >= content.length || content[index] !== '=') break

    const key = content.slice(keyStart, index).trim()
    index += 1

    if (content[index] === '"') {
      index += 1
      let value = ''
      while (index < content.length) {
        const char = content[index]
        if (char === '\\' && index + 1 < content.length) {
          value += content[index + 1]
          index += 2
          continue
        }
        if (char === '"') {
          index += 1
          break
        }
        value += char
        index += 1
      }
      env[key] = value
      continue
    }

    const valueStart = index
    while (index < content.length && content[index] !== '\n' && content[index] !== '\r') {
      index += 1
    }
    env[key] = content.slice(valueStart, index).trim()
  }

  return env
}

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL)) {
    throw new Error('Missing .env.local — run `npx vercel env pull .env.local --yes` or copy .env.example')
  }

  return parseEnvFile(fs.readFileSync(ENV_LOCAL, 'utf8'))
}

function loadEnvExample() {
  if (!fs.existsSync(ENV_EXAMPLE)) {
    throw new Error('Missing .env.example')
  }

  const env = {}
  for (const line of fs.readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

function requiredKeys() {
  return [
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI',
    'NEXT_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_UMAMI_WEBSITE_ID',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'BPM_SERVICE_URL',
    'GCP_SERVICE_ACCOUNT_KEY',
    'BLOB_READ_WRITE_TOKEN',
  ]
}

function writeEnvLocalPreserving(content, envUpdates) {
  let next = content.replace(/^GCP_SERVICE_ACCOUNT_KEY=[\s\S]*?(?=^[A-Z_][A-Z0-9_]*=|\s*$)/m, '').trimEnd()

  for (const [key, value] of Object.entries(envUpdates)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    if (pattern.test(next)) {
      next = next.replace(pattern, `${key}=${value}`)
    } else {
      next = `${next}\n${key}=${value}`
    }
  }

  fs.writeFileSync(ENV_LOCAL, `${next.trimEnd()}\n`)
}

module.exports = {
  ROOT,
  ENV_LOCAL,
  ENV_EXAMPLE,
  parseEnvFile,
  loadEnvLocal,
  loadEnvExample,
  requiredKeys,
  writeEnvLocalPreserving,
}
