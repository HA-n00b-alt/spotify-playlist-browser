/**
 * Names-only drift between the master `.env.local`, the catalog and each remote (#31).
 *
 * Pure functions over plain data, so they are unit-tested without touching a remote. A finding
 * carries a name and a status, never a value.
 *
 * Statuses, per target (remote + environment):
 * - `added`      a synced name the target lacks; `env:sync --write` adds it.
 * - `changed`    a synced name whose value differs; `env:sync --write` overwrites it.
 * - `unknown`    a synced name the target holds write-only (sensitive); `--write` rewrites it.
 * - `unchanged`  a synced name with the same value.
 * - `removed`    a catalog name the target holds but should not; `env:sync --write --prune`
 *                removes it when the catalog owns its value (`source: 'local' | 'default' | 'operator'`).
 * - `missing`    a name owned elsewhere (Vercel by hand, an integration) that the target lacks;
 *                fix it where it is owned.
 * - `extra`      a name the target holds that the catalog does not list there and that the sync
 *                does not own (integration copies, unlisted names); reported, never touched.
 * And for the master `.env.local`: `missing-required`, `unlisted`, `not-needed`.
 */
const { ENV_CATALOG } = require('./envCatalog')

/** @typedef {{ target: string, name: string, status: string }} Finding */

const PRUNABLE_SOURCES = new Set(['local', 'default', 'operator'])
/** Statuses that make `env:drift` exit non-zero. */
const DRIFT_STATUSES = new Set(['added', 'changed', 'removed', 'missing', 'missing-required'])

/**
 * @param {Record<string, string>} local master `.env.local`
 * @param {ReadonlyArray<import('./envCatalog').EnvVar>} [catalog]
 * @returns {Finding[]}
 */
function localFindings(local, catalog = ENV_CATALOG) {
  const findings = []
  for (const entry of catalog) {
    if (entry.local === 'required' && !(local[entry.name] ?? '').trim()) {
      findings.push({ target: 'local', name: entry.name, status: 'missing-required' })
    }
  }
  for (const name of Object.keys(local).sort()) {
    const entry = catalog.find((candidate) => candidate.name === name)
    if (!entry) findings.push({ target: 'local', name, status: 'unlisted' })
    else if (entry.local === 'none') findings.push({ target: 'local', name, status: 'not-needed' })
  }
  return findings
}

/**
 * @param {object} args
 * @param {string} args.target label, e.g. `vercel/production`
 * @param {(entry: import('./envCatalog').EnvVar) => boolean} args.targeted whether the catalog puts
 *   this name on this target
 * @param {Map<string, import('./envRemotes').RemoteEntry>} args.remote
 * @param {Record<string, string>} args.local master `.env.local`
 * @param {boolean} [args.owned] false when another repository owns the target's env (the Cloud
 *   Run services): names there that this catalog does not target are `extra`, never `removed`
 * @param {ReadonlyArray<import('./envCatalog').EnvVar>} [args.catalog]
 * @returns {Finding[]}
 */
function remoteFindings({ target, targeted, remote, local, owned = true, catalog = ENV_CATALOG }) {
  const findings = []
  const push = (name, status) => findings.push({ target, name, status })

  for (const entry of catalog) {
    const present = remote.get(entry.name)
    if (targeted(entry)) {
      if (entry.source !== 'local') {
        if (!present) push(entry.name, 'missing')
        continue
      }
      const value = local[entry.name]
      if (value === undefined || value === '') continue // reported as a local finding
      if (!present) push(entry.name, 'added')
      else if (present.value === undefined) push(entry.name, 'unknown')
      else push(entry.name, present.value === value ? 'unchanged' : 'changed')
    } else if (present) {
      push(entry.name, owned && PRUNABLE_SOURCES.has(entry.source) ? 'removed' : 'extra')
    }
  }

  for (const name of [...remote.keys()].sort()) {
    if (!catalog.some((entry) => entry.name === name)) push(name, 'extra')
  }
  return findings
}

/** @param {Finding[]} findings */
function hasDrift(findings) {
  return findings.some((finding) => DRIFT_STATUSES.has(finding.status))
}

module.exports = { DRIFT_STATUSES, hasDrift, localFindings, remoteFindings }
