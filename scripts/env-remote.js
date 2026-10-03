#!/usr/bin/env node
/**
 * Env names across the master `.env.local`, Vercel, GitHub Actions and Cloud Run (#31, ADR 0004).
 * Runs from the main checkout or any worktree, and prints names and statuses only, never values.
 *
 *   npm run env:inventory [-- --markdown]     every name and where it is today
 *   npm run env:drift                         names-only drift against the catalog; exits 1 on drift
 *   npm run env:sync [-- --write [--prune]]   push synced names from the master .env.local
 *
 * `--only=vercel,github,cloudrun` limits the remotes. `env:sync` is a dry run unless `--write` is
 * passed; `--prune` also removes catalog names a target should not hold. Cloud Run services are
 * owned by the BPM service repository: they are inventoried, never pruned.
 */
const { ENV_CATALOG, findEnvVar } = require('./lib/envCatalog')
const { hasDrift, localFindings, remoteFindings } = require('./lib/envDrift')
const { loadEnvLocal } = require('./lib/env')
const remotes = require('./lib/envRemotes')

const REMOTES = ['vercel', 'github', 'cloudrun']

/**
 * @typedef {object} Target
 * @property {string} label e.g. `vercel/production`
 * @property {string} remote
 * @property {string} environment
 * @property {Map<string, import('./lib/envRemotes').RemoteEntry>} names
 * @property {(entry: import('./lib/envCatalog').EnvVar) => boolean} targeted
 * @property {boolean} owned
 */

/**
 * Read every selected remote into a flat list of targets.
 *
 * @param {string[]} only
 * @param {{ values: boolean }} options
 * @returns {{ targets: Target[], unreachable: string[], notes: string[] }}
 */
function readTargets(only, { values }) {
  const targets = []
  const unreachable = []
  const notes = []

  if (only.includes('vercel')) {
    const snapshot = remotes.readVercel({ values })
    if (!snapshot.reachable) unreachable.push(`vercel: ${snapshot.error}`)
    for (const [environment, names] of snapshot.environments) {
      targets.push({
        label: `vercel/${environment}`,
        remote: 'vercel',
        environment,
        names,
        targeted: (entry) => entry.vercel.includes(environment),
        owned: true,
      })
    }
  }

  if (only.includes('github')) {
    const snapshot = remotes.readGithub()
    if (!snapshot.reachable) unreachable.push(`github: ${snapshot.error}`)
    notes.push(...(snapshot.notes ?? []).map((note) => `github: ${note}`))
    for (const [environment, names] of snapshot.environments) {
      targets.push({
        label: `github/${environment}`,
        remote: 'github',
        environment,
        names,
        targeted: (entry) => entry.github.includes(environment),
        owned: true,
      })
    }
  }

  if (only.includes('cloudrun')) {
    const services = [...new Set([...remotes.CLOUD_RUN_SERVICES, ...ENV_CATALOG.flatMap((entry) => entry.cloudRun)])]
    const snapshot = remotes.readCloudRun(services)
    if (!snapshot.reachable) unreachable.push(`cloudrun: ${snapshot.error}`)
    notes.push(...(snapshot.notes ?? []).map((note) => `cloudrun: ${note}`))
    for (const [service, names] of snapshot.environments) {
      const owned = ENV_CATALOG.some((entry) => entry.cloudRun.includes(service))
      targets.push({
        label: `cloudrun/${service}`,
        remote: 'cloudrun',
        environment: service,
        names,
        targeted: (entry) => entry.cloudRun.includes(service),
        owned,
      })
    }
  }

  return { targets, unreachable, notes }
}

/** @param {string[]} argv */
function parseOnly(argv) {
  const flag = argv.find((arg) => arg.startsWith('--only='))
  const only = flag ? flag.slice('--only='.length).split(',').map((name) => name.trim().toLowerCase()) : REMOTES
  const unknown = only.filter((name) => !REMOTES.includes(name))
  if (unknown.length > 0) throw new Error(`unknown remote(s): ${unknown.join(', ')} (expected ${REMOTES.join(', ')})`)
  return only
}

/** @param {{ unreachable: string[], notes: string[] }} read */
function printReachability({ unreachable, notes }) {
  for (const line of unreachable) console.warn(`UNREACHABLE ${line}`)
  for (const line of notes) console.log(`note ${line}`)
}

// ---------------------------------------------------------------- inventory

/** @param {string[]} argv */
function inventory(argv) {
  const markdown = argv.includes('--markdown')
  const local = loadEnvLocal()
  const read = readTargets(parseOnly(argv), { values: false })

  const names = new Set([...ENV_CATALOG.map((entry) => entry.name), ...Object.keys(local)])
  for (const target of read.targets) for (const name of target.names.keys()) names.add(name)

  const header = ['Name', 'Catalog', 'Secret', 'Local', ...read.targets.map((target) => target.label)]
  const rows = [...names].sort().map((name) => {
    const entry = findEnvVar(name)
    return [
      name,
      entry ? entry.source : 'unlisted',
      entry ? (entry.secret ? 'yes' : 'no') : '?',
      name in local ? 'set' : '—',
      ...read.targets.map((target) => {
        const present = target.names.get(name)
        return present ? present.type ?? 'set' : '—'
      }),
    ]
  })

  if (markdown) {
    console.log(`| ${header.join(' | ')} |`)
    console.log(`|${header.map(() => '---').join('|')}|`)
    for (const row of rows) console.log(`| \`${row[0]}\` | ${row.slice(1).join(' | ')} |`)
  } else {
    const widths = header.map((_, column) => Math.max(...[header, ...rows].map((row) => row[column].length)))
    for (const row of [header, ...rows]) {
      console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd())
    }
  }
  printReachability(read)
  return read.unreachable.length === 0
}

// ---------------------------------------------------------------- drift and sync

/**
 * @param {string[]} only
 * @returns {{ local: Record<string, string>, findings: import('./lib/envDrift').Finding[], targets: Target[], read: ReturnType<typeof readTargets> }}
 */
function collectFindings(only) {
  const local = loadEnvLocal()
  const read = readTargets(only, { values: true })
  const findings = [
    ...localFindings(local),
    ...read.targets.flatMap((target) =>
      remoteFindings({ target: target.label, targeted: target.targeted, remote: target.names, local, owned: target.owned })
    ),
  ]
  return { local, findings, targets: read.targets, read }
}

/** @param {import('./lib/envDrift').Finding[]} findings */
function printFindings(findings, { hide = ['unchanged'] } = {}) {
  const shown = findings.filter((finding) => !hide.includes(finding.status))
  const width = Math.max(0, ...shown.map((finding) => finding.target.length))
  for (const finding of shown) {
    console.log(`${finding.target.padEnd(width)}  ${finding.status.padEnd(16)}  ${finding.name}`)
  }
  const counts = new Map()
  for (const finding of findings) counts.set(finding.status, (counts.get(finding.status) ?? 0) + 1)
  console.log(`summary: ${[...counts].map(([status, count]) => `${status} ${count}`).join(', ') || 'nothing to report'}`)
}

/** @param {string[]} argv */
function drift(argv) {
  const { findings, read } = collectFindings(parseOnly(argv))
  printFindings(findings)
  printReachability(read)
  if (read.unreachable.length > 0) {
    console.error('env:drift incomplete: a remote was unreachable')
    return false
  }
  if (hasDrift(findings)) {
    console.error('env:drift found drift (see above; `npm run env:sync` shows what a sync would change)')
    return false
  }
  console.log('env:drift: no drift')
  return true
}

const WRITE_STATUSES = new Set(['added', 'changed', 'unknown'])

/**
 * Push synced names from the master `.env.local` to the selected remotes. Dry run unless `write`.
 *
 * @param {{ only?: string[], write?: boolean, prune?: boolean }} [options]
 * @returns {boolean}
 */
function sync({ only = REMOTES, write = false, prune = false } = {}) {
  const { local, findings, targets, read } = collectFindings(only)
  printReachability(read)
  if (read.unreachable.length > 0) throw new Error('env:sync stopped: a remote was unreachable')

  const plan = findings.filter(
    (finding) => WRITE_STATUSES.has(finding.status) || (prune && finding.status === 'removed')
  )
  const label = write ? '' : ' (dry run; pass --write to apply)'
  console.log(`env:sync plan${label}:`)
  printFindings(
    findings
      .filter((finding) => finding.target !== 'local')
      .map((finding) =>
        finding.status === 'removed' && !prune ? { ...finding, status: 'removed (--prune)' } : finding
      ),
    { hide: [] }
  )

  if (!write) return true

  for (const finding of plan) {
    const target = targets.find((candidate) => candidate.label === finding.target)
    const entry = findEnvVar(finding.name)
    const secret = entry?.secret ?? true
    if (finding.status === 'removed') {
      console.log(`env:sync: removing ${finding.name} from ${finding.target}`)
      if (target.remote === 'vercel') remotes.removeVercel(finding.name, target.environment)
      else if (target.remote === 'github') remotes.removeGithub(finding.name, target.names.get(finding.name)?.type === 'secret')
      else remotes.removeCloudRun(target.environment, finding.name)
      continue
    }
    console.log(`env:sync: writing ${finding.name} to ${finding.target} (${finding.status})`)
    const value = local[finding.name]
    if (target.remote === 'vercel') remotes.writeVercel(finding.name, target.environment, value, secret)
    else if (target.remote === 'github') remotes.writeGithub(finding.name, value, secret)
    else remotes.writeCloudRun(target.environment, finding.name, value, secret)
  }
  console.log(`env:sync: ${plan.length} change(s) applied`)
  return true
}

function main() {
  const [command, ...argv] = process.argv.slice(2)
  let ok
  if (command === 'inventory') ok = inventory(argv)
  else if (command === 'drift') ok = drift(argv)
  else if (command === 'sync') ok = sync({ only: parseOnly(argv), write: argv.includes('--write'), prune: argv.includes('--prune') })
  else throw new Error('usage: env-remote.js inventory|drift|sync [--only=vercel,github,cloudrun] [--write] [--prune] [--markdown]')
  if (!ok) process.exit(1)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

module.exports = { sync }
