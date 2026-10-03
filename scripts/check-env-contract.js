#!/usr/bin/env node
/**
 * `npm run check:env-contract` (#31). Reads the master `.env.local` (in the main checkout, also
 * when run from a worktree) and prints names only, never values. Fails when:
 *
 * - code reads a `process.env` name that `scripts/lib/envCatalog.js` does not list;
 * - `.env.example` or the placement table in `docs/SECRETS-AND-ENVIRONMENT.md` is stale;
 * - a required name is empty in the master `.env.local`;
 * - the BPM service URL or the GCP service account is not the expected `delman-site` one.
 *
 * On GitHub Actions (`CI=true`, #9) there is no master `.env.local`, so only the catalog and the
 * generated docs are checked; the master-file checks still run on every local verify.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ENV_LOCAL, ROOT, loadEnvLocal } = require('./lib/env')
const { ENV_CATALOG, findEnvVar, requiredLocalNames } = require('./lib/envCatalog')
const {
  DOC_FILE,
  EXAMPLE_FILE,
  renderCatalogTable,
  renderEnvExample,
  replaceCatalogSection,
  scanEnvUsage,
} = require('./lib/envDocs')

const EXPECTED_SA_EMAIL = 'vercel-bpm-invoker@delman-site.iam.gserviceaccount.com'

/** @param {string[]} errors */
function checkCatalog(errors) {
  const usage = scanEnvUsage(ROOT)
  for (const [name, files] of usage) {
    if (!findEnvVar(name)) {
      errors.push(`${name} is read by ${files.join(', ')} but missing from scripts/lib/envCatalog.js`)
    }
  }

  const examplePath = path.join(ROOT, EXAMPLE_FILE)
  if (!fs.existsSync(examplePath) || fs.readFileSync(examplePath, 'utf8') !== renderEnvExample()) {
    errors.push(`${EXAMPLE_FILE} is stale — run \`npm run generate:env-docs\` and commit the result`)
  }

  const doc = fs.readFileSync(path.join(ROOT, DOC_FILE), 'utf8')
  if (replaceCatalogSection(doc, renderCatalogTable(ENV_CATALOG, usage)) !== doc) {
    errors.push(`${DOC_FILE} placement table is stale — run \`npm run generate:env-docs\``)
  }
}

/** @param {string[]} errors */
function checkMasterEnvLocal(errors) {
  const env = loadEnvLocal()

  for (const name of requiredLocalNames()) {
    if (!env[name] || !String(env[name]).trim()) {
      errors.push(`master .env.local missing required value: ${name}`)
    }
  }

  for (const entry of ENV_CATALOG) {
    if (entry.expected && env[entry.name] && env[entry.name] !== entry.expected) {
      errors.push(`${entry.name} must be ${entry.expected} (got ${env[entry.name]})`)
    }
  }

  try {
    const sa = JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY)
    if (sa.project_id !== 'delman-site') {
      errors.push(`GCP service account project_id must be delman-site (got ${sa.project_id})`)
    }
    if (sa.client_email !== EXPECTED_SA_EMAIL) {
      errors.push(`GCP service account must be ${EXPECTED_SA_EMAIL} (got ${sa.client_email})`)
    }
  } catch (error) {
    errors.push(
      `GCP_SERVICE_ACCOUNT_KEY must be valid single-line JSON (${error instanceof SyntaxError ? 'parse error' : error})`
    )
  }
}

function main() {
  const errors = []
  checkCatalog(errors)
  const inCi = process.env.CI === 'true'
  if (!inCi) checkMasterEnvLocal(errors)

  if (errors.length > 0) {
    console.error('check:env-contract failed:')
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
    process.exit(1)
  }

  console.log(
    inCi
      ? 'check:env-contract passed (CI: catalog and docs only, no master .env.local)'
      : `check:env-contract passed (master: ${ENV_LOCAL})`
  )
}

main()
