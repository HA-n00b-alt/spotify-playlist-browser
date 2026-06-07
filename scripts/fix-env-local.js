#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { ENV_LOCAL, parseEnvFile } = require('./lib/env')

const KEY = 'GCP_SERVICE_ACCOUNT_KEY'
const BPM_URL = 'https://bpm-service-7jlgdaerna-ey.a.run.app'
const jsonKeyPath = process.argv[2] || path.resolve(__dirname, '..', 'vercel-bpm-invoker-delman-site.json')

function resolveKeyFile() {
  if (fs.existsSync(jsonKeyPath)) return jsonKeyPath
  return null
}

function main() {
  if (!fs.existsSync(ENV_LOCAL)) {
    console.error('Missing .env.local')
    process.exit(1)
  }

  const keyFile = resolveKeyFile()
  if (!keyFile) {
    console.error('No service account key file found.')
    process.exit(1)
  }

  const compactJson = JSON.stringify(JSON.parse(fs.readFileSync(keyFile, 'utf8')))
  const parsed = JSON.parse(compactJson)

  const lines = fs.readFileSync(ENV_LOCAL, 'utf8').split(/\r?\n/)
  const kept = []
  let skippingBrokenGcp = false

  for (const line of lines) {
    if (line.startsWith(`${KEY}=`)) {
      skippingBrokenGcp = true
      continue
    }

    if (skippingBrokenGcp) {
      if (/^[A-Z_][A-Z0-9_]*=/.test(line) || line.startsWith('#')) {
        skippingBrokenGcp = false
      } else {
        continue
      }
    }

    if (line.startsWith('BPM_SERVICE_URL=')) {
      continue
    }

    kept.push(line)
  }

  while (kept.length > 0 && kept[kept.length - 1].trim() === '') {
    kept.pop()
  }

  kept.push(`BPM_SERVICE_URL=${BPM_URL}`)
  kept.push(`${KEY}=${compactJson}`)

  fs.writeFileSync(ENV_LOCAL, `${kept.join('\n')}\n`)

  console.log(`Fixed .env.local: ${KEY} is single-line JSON (${parsed.client_email})`)
}

main()
