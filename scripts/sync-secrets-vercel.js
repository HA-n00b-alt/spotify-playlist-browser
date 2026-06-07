#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { loadEnvLocal } = require('./lib/env')

const SYNC_KEYS = ['BPM_SERVICE_URL', 'GCP_SERVICE_ACCOUNT_KEY']
const ENVIRONMENTS = ['production', 'development']

function runVercel(args, input) {
  const result = spawnSync('npx', ['vercel', ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  if (result.status !== 0) {
    throw new Error(`vercel ${args.join(' ')} failed`)
  }
}

function removeEnv(key, environment) {
  spawnSync('npx', ['vercel', 'env', 'rm', key, environment, '--yes'], {
    stdio: 'ignore',
  })
}

function addEnv(key, value, environment) {
  if (key === 'BPM_SERVICE_URL') {
    runVercel(['env', 'add', key, environment, '--value', value, '--yes', '--force'])
    return
  }

  const args = ['env', 'add', key, environment, '--yes', '--force']
  if (environment === 'production') {
    args.push('--sensitive')
  }

  runVercel(args, value)
}

function main() {
  const env = loadEnvLocal()

  for (const key of SYNC_KEYS) {
    const value = env[key]
    if (!value) {
      throw new Error(`Missing ${key} in .env.local`)
    }

    for (const environment of ENVIRONMENTS) {
      console.log(`sync-secrets: updating ${key} (${environment})`)
      removeEnv(key, environment)
      addEnv(key, value, environment)
    }
  }

  console.log('sync-secrets: done (production + development; preview skipped — git disconnected)')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

module.exports = { main }
