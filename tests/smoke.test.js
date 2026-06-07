const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const EXPECTED_BPM_URL = 'https://bpm-service-7jlgdaerna-ey.a.run.app'

test('BPM service fallbacks point at delman-site Cloud Run URL', () => {
  const files = [
    'lib/bpm.ts',
    'app/actions/process.ts',
    'app/api/bpm/health/route.ts',
    'app/api/bpm/stream-batch/route.ts',
    'app/api/stream/[batch_id]/route.ts',
  ]

  for (const file of files) {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.match(content, new RegExp(EXPECTED_BPM_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(content, /340051416180/)
  }
})

test('.env.example declares BPM migration contract', () => {
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')
  assert.match(example, /BPM_SERVICE_URL=/)
  assert.match(example, /GCP_SERVICE_ACCOUNT_KEY=/)
  assert.match(example, new RegExp(EXPECTED_BPM_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('.env.example declares Vercel Blob deployment manifest contract', () => {
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')
  assert.match(example, /BLOB_READ_WRITE_TOKEN=/)
  assert.match(example, /DEPLOY_MANIFEST_BLOB_PATH=/)
})

test('env contract includes Vercel Blob deployment manifest key', async () => {
  const { requiredKeys } = require(path.join(ROOT, 'scripts/lib/env.js'))
  const keys = requiredKeys()
  assert.ok(keys.includes('BLOB_READ_WRITE_TOKEN'))
})

test('deploy pipeline scripts exist', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/deploy-production.js')))
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/verify.js')))
})

test('migration runner uses a database-backed schema_migrations ledger', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/apply-migrations.js'), 'utf8')
  assert.match(script, /CREATE TABLE IF NOT EXISTS schema_migrations/)
  assert.match(script, /INSERT INTO schema_migrations/)
  assert.doesNotMatch(script, /psql/)
})
