/**
 * Read and write env names on the remotes (#31): Vercel, GitHub Actions and Cloud Run.
 *
 * Nothing here prints a value. Values cross process boundaries only through stdin or a temporary
 * 0600 file that is deleted straight after, never through argv for a secret.
 *
 * Every adapter returns `{ reachable, error?, environments }`, where `environments` maps an
 * environment label to `Map<name, RemoteEntry>`.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { MASTER_ROOT, ROOT, parseEnvFile } = require('./env')

const VERCEL_ENVIRONMENTS = Object.freeze(['production', 'preview', 'development'])
const GCP_PROJECT = 'delman-site'
const CLOUD_RUN_REGION = 'europe-west3'
/** Cloud Run services this app calls; inventoried even when no name is targeted at them. */
const CLOUD_RUN_SERVICES = Object.freeze(['bpm-service'])
const BPM_INVOKER = 'serviceAccount:vercel-bpm-invoker@delman-site.iam.gserviceaccount.com'

/**
 * @typedef {object} RemoteEntry
 * @property {string} [type] the remote's own kind (sensitive, encrypted, secret, variable, plain…)
 * @property {string | undefined} value undefined when the remote does not return it
 */

/**
 * @typedef {object} RemoteSnapshot
 * @property {string} remote
 * @property {boolean} reachable
 * @property {string} [error] names-only reason it was not reachable
 * @property {Map<string, Map<string, RemoteEntry>>} environments
 * @property {string[]} [notes]
 */

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ input?: string, cwd?: string }} [options]
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    input: options.input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
  })
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout ?? '',
    stderr: (result.stderr ?? '').trim() || (result.error ? String(result.error.message) : ''),
  }
}

/** First line of a CLI error, which names the problem without echoing input. */
function reason(stderr) {
  const line = stderr.split('\n').find((text) => /error|denied|not|invalid|failed/i.test(text))
  return (line ?? stderr.split('\n')[0] ?? 'unknown error').trim().slice(0, 200)
}

/** Parse the first JSON value in a CLI's stdout, skipping any banner before it. */
function parseJsonOutput(stdout) {
  const start = stdout.search(/[[{]/)
  if (start === -1) throw new Error('no JSON in output')
  return JSON.parse(stdout.slice(start))
}

// ---------------------------------------------------------------- Vercel

/** The Vercel CLI runs against the main checkout, which holds the `.vercel` project link. */
function vercel(args, options = {}) {
  return run('npx', ['--yes', 'vercel', ...args, '--cwd', MASTER_ROOT], options)
}

/**
 * Names and types per environment, plus the values `vercel env pull` returns. Sensitive values
 * come back empty from Vercel, so they are recorded as unknown.
 *
 * @param {{ values?: boolean, environments?: ReadonlyArray<string> }} [options]
 * @returns {RemoteSnapshot}
 */
function readVercel({ values = true, environments = VERCEL_ENVIRONMENTS } = {}) {
  const snapshot = { remote: 'vercel', reachable: false, environments: new Map() }
  const list = vercel(['env', 'ls', '--format', 'json'])
  if (!list.ok) return { ...snapshot, error: reason(list.stderr) }

  let envs
  try {
    const parsed = parseJsonOutput(list.stdout)
    envs = Array.isArray(parsed) ? parsed : parsed.envs
  } catch (error) {
    return { ...snapshot, error: `could not parse \`vercel env ls\` (${error.message})` }
  }

  for (const environment of environments) snapshot.environments.set(environment, new Map())
  for (const env of envs) {
    for (const target of env.target ?? []) {
      snapshot.environments.get(target)?.set(env.key, { type: env.type, value: undefined })
    }
  }

  if (values) {
    for (const environment of environments) {
      const pulled = pullVercelValues(environment)
      if (!pulled) continue
      for (const [name, entry] of snapshot.environments.get(environment)) {
        const value = pulled[name]
        if (entry.type !== 'sensitive' && value !== undefined) entry.value = value
      }
    }
  }

  return { ...snapshot, reachable: true }
}

/** `vercel env pull` into a private temp dir, parse, delete. Returns null when it fails. */
function pullVercelValues(environment) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-drift-'))
  const file = path.join(dir, '.env')
  try {
    const pulled = vercel(['env', 'pull', file, `--environment=${environment}`, '--yes'])
    if (!pulled.ok || !fs.existsSync(file)) return null
    fs.chmodSync(file, 0o600)
    return parseEnvFile(fs.readFileSync(file, 'utf8'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * @param {string} name
 * @param {string} environment
 * @param {string} value
 * @param {boolean} secret
 */
function writeVercel(name, environment, value, secret) {
  // Remove first: `env add --force` cannot change an existing variable's type.
  vercel(['env', 'rm', name, environment, '--yes'])
  const args = ['env', 'add', name, environment, '--yes', '--force']
  if (secret && environment === 'production') args.push('--sensitive')
  const added = vercel(args, { input: value })
  if (!added.ok) throw new Error(`vercel env add ${name} ${environment} failed: ${reason(added.stderr)}`)
}

/** @param {string} name @param {string} environment */
function removeVercel(name, environment) {
  const removed = vercel(['env', 'rm', name, environment, '--yes'])
  if (!removed.ok) throw new Error(`vercel env rm ${name} ${environment} failed: ${reason(removed.stderr)}`)
}

// ---------------------------------------------------------------- GitHub

/**
 * Actions secrets (names only; GitHub never returns them) and variables (values readable).
 *
 * @returns {RemoteSnapshot}
 */
function readGithub() {
  const snapshot = { remote: 'github', reachable: false, environments: new Map() }
  const secrets = run('gh', ['secret', 'list', '--json', 'name'])
  const variables = run('gh', ['variable', 'list', '--json', 'name,value'])
  if (!secrets.ok || !variables.ok) {
    return { ...snapshot, error: reason(secrets.ok ? variables.stderr : secrets.stderr) }
  }

  const actions = new Map()
  for (const { name } of JSON.parse(secrets.stdout || '[]')) actions.set(name, { type: 'secret', value: undefined })
  for (const { name, value } of JSON.parse(variables.stdout || '[]')) actions.set(name, { type: 'variable', value })
  snapshot.environments.set('actions', actions)

  const workflows = path.join(ROOT, '.github', 'workflows')
  const notes = fs.existsSync(workflows) ? [] : ['no .github/workflows: nothing in Actions reads env']
  return { ...snapshot, reachable: true, notes }
}

/** @param {string} name @param {string} value @param {boolean} secret */
function writeGithub(name, value, secret) {
  const result = secret
    ? run('gh', ['secret', 'set', name], { input: value })
    : run('gh', ['variable', 'set', name, '--body', value])
  if (!result.ok) throw new Error(`gh ${secret ? 'secret' : 'variable'} set ${name} failed: ${reason(result.stderr)}`)
}

/** @param {string} name @param {boolean} secret */
function removeGithub(name, secret) {
  const result = run('gh', [secret ? 'secret' : 'variable', 'delete', name])
  if (!result.ok) throw new Error(`gh delete ${name} failed: ${reason(result.stderr)}`)
}

// ---------------------------------------------------------------- Cloud Run

function gcloud(args) {
  return run('gcloud', [...args, '--project', GCP_PROJECT, '--quiet'])
}

/**
 * Env names on each Cloud Run service: plain values are readable, Secret Manager references are
 * recorded as `secretRef` without a value. Also checks that the Vercel invoker may call the BPM
 * service, which is what GCP_SERVICE_ACCOUNT_KEY is for.
 *
 * @param {ReadonlyArray<string>} services
 * @returns {RemoteSnapshot}
 */
function readCloudRun(services) {
  const snapshot = { remote: 'cloudRun', reachable: false, environments: new Map(), notes: [] }
  for (const service of services) {
    const described = gcloud(['run', 'services', 'describe', service, '--region', CLOUD_RUN_REGION, '--format', 'json'])
    if (!described.ok) return { ...snapshot, error: reason(described.stderr) }
    const spec = JSON.parse(described.stdout).spec.template.spec
    const names = new Map()
    for (const container of spec.containers ?? []) {
      for (const env of container.env ?? []) {
        names.set(
          env.name,
          env.valueFrom ? { type: 'secretRef', value: undefined } : { type: 'plain', value: env.value ?? '' }
        )
      }
    }
    snapshot.environments.set(service, names)

    if (service === 'bpm-service') {
      const policy = gcloud(['run', 'services', 'get-iam-policy', service, '--region', CLOUD_RUN_REGION, '--format', 'json'])
      if (policy.ok) {
        const bindings = JSON.parse(policy.stdout).bindings ?? []
        const invokers = bindings.find((binding) => binding.role === 'roles/run.invoker')?.members ?? []
        snapshot.notes.push(
          invokers.includes(BPM_INVOKER)
            ? 'bpm-service: vercel-bpm-invoker holds roles/run.invoker'
            : 'bpm-service: vercel-bpm-invoker is MISSING roles/run.invoker'
        )
      }
    }
  }
  return { ...snapshot, reachable: true }
}

/** @param {string} service @param {string} name @param {string} value @param {boolean} secret */
function writeCloudRun(service, name, value, secret) {
  if (secret) {
    throw new Error(
      `${name} is secret: Cloud Run secrets belong in Secret Manager (disabled in ${GCP_PROJECT}), not plain env`
    )
  }
  const result = gcloud([
    'run', 'services', 'update', service, '--region', CLOUD_RUN_REGION, '--update-env-vars', `${name}=${value}`,
  ])
  if (!result.ok) throw new Error(`gcloud run services update ${service} failed: ${reason(result.stderr)}`)
}

/** @param {string} service @param {string} name */
function removeCloudRun(service, name) {
  const result = gcloud(['run', 'services', 'update', service, '--region', CLOUD_RUN_REGION, '--remove-env-vars', name])
  if (!result.ok) throw new Error(`gcloud run services update ${service} failed: ${reason(result.stderr)}`)
}

module.exports = {
  CLOUD_RUN_SERVICES,
  VERCEL_ENVIRONMENTS,
  readCloudRun,
  readGithub,
  readVercel,
  removeCloudRun,
  removeGithub,
  removeVercel,
  writeCloudRun,
  writeGithub,
  writeVercel,
}
