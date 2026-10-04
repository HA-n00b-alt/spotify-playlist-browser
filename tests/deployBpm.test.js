import { test } from 'vitest'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { bpmServiceHashes, previousBpmHashes } = require('../scripts/lib/deploy/bpm')
const { manifestEntry } = require('../scripts/lib/deploy/guards')

function seedFile(services) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-seed-'))
  const file = path.join(dir, 'deploy.lock.json')
  fs.writeFileSync(file, JSON.stringify({ services }))
  return file
}

const missingSeed = path.join(os.tmpdir(), 'no-such-dir', 'deploy.lock.json')

test('previousBpmHashes takes the latest deployment that recorded BPM hashes', () => {
  const manifest = {
    deployments: [
      { commit: 'a', bpmServices: { 'bpm-service': 'old' } },
      { commit: 'b', bpmServices: { 'bpm-service': 'new', 'bpm-worker': 'w' } },
      { commit: 'c' },
    ],
  }
  assert.deepEqual(previousBpmHashes(manifest, missingSeed), { 'bpm-service': 'new', 'bpm-worker': 'w' })
})

test('previousBpmHashes falls back to the bpm-finder-api lock file before any deploy recorded hashes', () => {
  const seed = seedFile({ 'bpm-service': { contentHash: 'h1', url: 'https://x' }, 'bpm-worker': { contentHash: 'h2' } })
  assert.deepEqual(previousBpmHashes({ deployments: [{ commit: 'a' }] }, seed), {
    'bpm-service': 'h1',
    'bpm-worker': 'h2',
  })
})

test('previousBpmHashes is empty with no recorded hashes and no lock file, so every service deploys', () => {
  assert.deepEqual(previousBpmHashes({}, missingSeed), {})
})

test('the deployed BPM hashes are recorded in the manifest entry', () => {
  const bpmServices = bpmServiceHashes({ 'bpm-service': { contentHash: 'h1', url: 'https://x' } })
  assert.deepEqual(bpmServices, { 'bpm-service': 'h1' })
  assert.deepEqual(
    manifestEntry({ commit: 'abc', timestamp: 't', productionUrl: 'https://x', bpmServices }).bpmServices,
    { 'bpm-service': 'h1' }
  )
})
