#!/usr/bin/env node
const { loadEnvLocal, loadEnvExample, requiredKeys } = require('./lib/env')

const EXPECTED_BPM_URL = 'https://bpm-service-7jlgdaerna-ey.a.run.app'
const EXPECTED_SA_EMAIL = 'vercel-bpm-invoker@delman-site.iam.gserviceaccount.com'

function main() {
  const env = loadEnvLocal()
  const example = loadEnvExample()
  const errors = []

  for (const key of requiredKeys()) {
    if (!(key in example)) {
      errors.push(`.env.example missing contract key: ${key}`)
    }
    if (!env[key] || !String(env[key]).trim()) {
      errors.push(`.env.local missing required value: ${key}`)
    }
  }

  if (env.BPM_SERVICE_URL !== EXPECTED_BPM_URL) {
    errors.push(
      `BPM_SERVICE_URL must be ${EXPECTED_BPM_URL} (got ${env.BPM_SERVICE_URL || 'unset'})`
    )
  }

  try {
    const sa = JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY)
    if (sa.project_id !== 'delman-site') {
      errors.push(`GCP service account project_id must be delman-site (got ${sa.project_id})`)
    }
    if (sa.client_email !== EXPECTED_SA_EMAIL) {
      errors.push(
        `GCP service account must be ${EXPECTED_SA_EMAIL} (got ${sa.client_email})`
      )
    }
  } catch (error) {
    errors.push(
      `GCP_SERVICE_ACCOUNT_KEY must be valid single-line JSON (${error instanceof Error ? error.message : error})`
    )
  }

  if (errors.length > 0) {
    console.error('check:env-contract failed:')
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
    process.exit(1)
  }

  console.log('check:env-contract passed')
}

main()
