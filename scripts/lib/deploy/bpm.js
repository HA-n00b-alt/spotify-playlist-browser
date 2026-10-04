/**
 * How `deploy:production` decides which BPM services to redeploy (#59). Each deployment manifest
 * entry records `bpmServices`: the content hash of every Cloud Run service as deployed. A service
 * whose current hash differs from the latest recorded one is redeployed.
 *
 * Deploys made before the BPM services moved into this repository recorded no hashes. For those,
 * `services/bpm/deploy.lock.json` (written by the last deploy from the old bpm-finder-api repo) is
 * the seed. It is read only, never written: once a deploy records `bpmServices`, it is unused.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../env')

const BPM_LOCK_SEED = path.join(ROOT, 'services', 'bpm', 'deploy.lock.json')

/**
 * The content hash of each BPM service at its last deploy, keyed by Cloud Run service name.
 *
 * @param {{ deployments?: Array<{ bpmServices?: Record<string, string> }> }} manifest
 * @param {string} [seedPath]
 * @returns {Record<string, string>}
 */
function previousBpmHashes(manifest, seedPath = BPM_LOCK_SEED) {
  const deployments = manifest.deployments ?? []
  for (let index = deployments.length - 1; index >= 0; index -= 1) {
    if (deployments[index].bpmServices) return { ...deployments[index].bpmServices }
  }

  if (!fs.existsSync(seedPath)) return {}
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
  return Object.fromEntries(
    Object.entries(seed.services ?? {}).map(([name, service]) => [name, service.contentHash])
  )
}

/**
 * The `bpmServices` map to record in the manifest from what `deployBpmServices` returned.
 *
 * @param {Record<string, { contentHash: string }>} services
 * @returns {Record<string, string>}
 */
function bpmServiceHashes(services) {
  return Object.fromEntries(Object.entries(services).map(([name, service]) => [name, service.contentHash]))
}

module.exports = { BPM_LOCK_SEED, bpmServiceHashes, previousBpmHashes }
