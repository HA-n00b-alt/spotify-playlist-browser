#!/usr/bin/env node
/**
 * Write `.env.example` and the placement table in `docs/SECRETS-AND-ENVIRONMENT.md` from
 * `ENV_CATALOG` (#31). `check:env-contract` fails when either is stale.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./lib/env')
const {
  DOC_FILE,
  EXAMPLE_FILE,
  renderCatalogTable,
  renderEnvExample,
  replaceCatalogSection,
  scanEnvUsage,
} = require('./lib/envDocs')

const examplePath = path.join(ROOT, EXAMPLE_FILE)
fs.writeFileSync(examplePath, renderEnvExample())
console.log(`${EXAMPLE_FILE} written`)

const docPath = path.join(ROOT, DOC_FILE)
const doc = fs.readFileSync(docPath, 'utf8')
fs.writeFileSync(docPath, replaceCatalogSection(doc, renderCatalogTable(undefined, scanEnvUsage(ROOT))))
console.log(`${DOC_FILE} placement table written`)
