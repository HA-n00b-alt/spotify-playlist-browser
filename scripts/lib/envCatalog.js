/**
 * Every environment variable this repository reads or configures, by name (#31).
 *
 * This list is the target map from `docs/SECRETS-AND-ENVIRONMENT.md` (ADR 0004). Everything else
 * is derived from it:
 *
 * - `.env.example` and the placement table in `docs/SECRETS-AND-ENVIRONMENT.md` are written by
 *   `npm run generate:env-docs`; `check:env-contract` fails when either is stale.
 * - `check:env-contract` fails when code reads a `process.env` name that is not listed here.
 * - `env:drift` compares the master `.env.local` and each remote against `vercel`, `github` and
 *   `cloudRun` below, and `env:sync` pushes the `source: 'local'` names to them.
 *
 * Fields:
 * - `source` — who owns the value:
 *   - `local`: the master `.env.local` in the main checkout; `env:sync` pushes it to the targets.
 *   - `vercel`: set by hand per Vercel environment (the value differs per environment); the local
 *     value is the development one and is never pushed.
 *   - `integration`: written into Vercel by a Marketplace integration (Neon, Blob); the local copy
 *     is pulled from Vercel and is never pushed.
 *   - `platform`: set by Node, Next.js or Vercel at run time; never configured.
 *   - `default`: optional tuning with a default in code; configured nowhere today.
 *   - `operator`: a flag for a script, passed on the command line when needed.
 * - `local` — whether the master `.env.local` needs it: `required`, `optional` or `none`.
 * - `vercel`, `github`, `cloudRun` — target environments on each remote (empty: does not belong).
 * - `secret` — true when the value grants access; such values are never printed, and are written
 *   to Vercel production as `sensitive`.
 */

/** @typedef {'local' | 'vercel' | 'integration' | 'platform' | 'default' | 'operator'} EnvSource */
/** @typedef {'production' | 'preview' | 'development'} VercelEnvironment */

/**
 * @typedef {object} EnvVar
 * @property {string} name
 * @property {string} purpose one line, no values
 * @property {boolean} secret
 * @property {EnvSource} source
 * @property {'required' | 'optional' | 'none'} local
 * @property {ReadonlyArray<VercelEnvironment>} vercel
 * @property {ReadonlyArray<string>} github Actions secret or variable scopes (none today)
 * @property {ReadonlyArray<string>} cloudRun Cloud Run services (none today)
 * @property {string} [expected] the only accepted value, for non-secret names pinned by a check
 * @property {string} group heading in `.env.example`
 */

const PROD_DEV = Object.freeze(['production', 'development'])
const ALL_VERCEL = Object.freeze(['production', 'preview', 'development'])
const NONE = Object.freeze([])

const BPM_SERVICE_URL = 'https://bpm-service-7jlgdaerna-ey.a.run.app'

/** @param {Partial<EnvVar> & Pick<EnvVar, 'name' | 'purpose' | 'source' | 'group'>} entry */
function envVar(entry) {
  return Object.freeze({
    secret: false,
    local: 'none',
    vercel: NONE,
    github: NONE,
    cloudRun: NONE,
    ...entry,
  })
}

/** @type {ReadonlyArray<EnvVar>} */
const ENV_CATALOG = Object.freeze([
  // Spotify
  envVar({
    name: 'SPOTIFY_CLIENT_ID',
    purpose: 'Spotify app client id for the OAuth login and API calls',
    source: 'local',
    local: 'required',
    vercel: PROD_DEV,
    group: 'Spotify OAuth',
  }),
  envVar({
    name: 'SPOTIFY_CLIENT_SECRET',
    purpose: 'Spotify app client secret for the token exchange and refresh',
    secret: true,
    source: 'local',
    local: 'required',
    vercel: PROD_DEV,
    group: 'Spotify OAuth',
  }),
  envVar({
    name: 'SPOTIFY_REDIRECT_URI',
    purpose: 'OAuth callback URL registered with Spotify; differs per environment',
    source: 'vercel',
    local: 'required',
    vercel: PROD_DEV,
    group: 'Spotify OAuth',
  }),
  envVar({
    name: 'NEXT_PUBLIC_BASE_URL',
    purpose: 'Public base URL of the app; differs per environment',
    source: 'vercel',
    local: 'required',
    vercel: PROD_DEV,
    group: 'Spotify OAuth',
  }),

  // Analytics and error tracking
  envVar({
    name: 'NEXT_PUBLIC_UMAMI_WEBSITE_ID',
    purpose: 'Umami website id; analytics are off when unset (inlined at build time)',
    source: 'local',
    local: 'required',
    vercel: PROD_DEV,
    group: 'Analytics and error tracking',
  }),
  envVar({
    name: 'NEXT_PUBLIC_SENTRY_DSN',
    purpose: 'Sentry DSN for browser and server error reports; Sentry is off when unset',
    source: 'local',
    local: 'optional',
    vercel: PROD_DEV,
    group: 'Analytics and error tracking',
  }),
  envVar({
    name: 'SENTRY_DSN',
    purpose: 'Server-only Sentry DSN override; falls back to NEXT_PUBLIC_SENTRY_DSN',
    source: 'default',
    local: 'optional',
    group: 'Analytics and error tracking',
  }),
  envVar({
    name: 'SENTRY_ORG',
    purpose: 'Sentry organisation slug for the source-map upload at build time',
    source: 'local',
    local: 'optional',
    vercel: PROD_DEV,
    group: 'Analytics and error tracking',
  }),
  envVar({
    name: 'SENTRY_PROJECT',
    purpose: 'Sentry project slug for the source-map upload at build time',
    source: 'local',
    local: 'optional',
    vercel: PROD_DEV,
    group: 'Analytics and error tracking',
  }),
  envVar({
    name: 'SENTRY_AUTH_TOKEN',
    purpose: 'Sentry token for the source-map upload at build time',
    secret: true,
    source: 'local',
    local: 'optional',
    vercel: PROD_DEV,
    group: 'Analytics and error tracking',
  }),

  // Database (Neon, through the Vercel Marketplace integration)
  envVar({
    name: 'DATABASE_URL',
    purpose: 'Pooled Neon Postgres connection string used by the app',
    secret: true,
    source: 'integration',
    local: 'required',
    vercel: ALL_VERCEL,
    group: 'Database (Neon integration)',
  }),
  envVar({
    name: 'DATABASE_URL_UNPOOLED',
    purpose: 'Direct Neon Postgres connection string for migrations',
    secret: true,
    source: 'integration',
    local: 'required',
    vercel: ALL_VERCEL,
    group: 'Database (Neon integration)',
  }),
  ...[
    'NEON_PROJECT_ID',
    'PGDATABASE',
    'PGHOST',
    'PGHOST_UNPOOLED',
    'PGPASSWORD',
    'PGUSER',
    'POSTGRES_DATABASE',
    'POSTGRES_HOST',
    'POSTGRES_PASSWORD',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL_NO_SSL',
    'POSTGRES_USER',
  ].map((name) =>
    envVar({
      name,
      purpose: 'Written by the Neon integration; not read by this repository',
      secret: /PASSWORD|URL/.test(name),
      source: 'integration',
      vercel: ALL_VERCEL,
      group: 'Database (Neon integration)',
    })
  ),
  envVar({
    name: 'DB_LOG_LEVEL',
    purpose: 'Database query log level (default info)',
    source: 'default',
    local: 'optional',
    group: 'Database (Neon integration)',
  }),
  envVar({
    name: 'DB_SLOW_QUERY_MS',
    purpose: 'Slow-query log threshold in milliseconds (default 500)',
    source: 'default',
    local: 'optional',
    group: 'Database (Neon integration)',
  }),

  // BPM service on Cloud Run
  envVar({
    name: 'BPM_SERVICE_URL',
    purpose: 'BPM/key analysis service on Cloud Run (delman-site)',
    source: 'local',
    local: 'required',
    vercel: PROD_DEV,
    expected: BPM_SERVICE_URL,
    group: 'BPM service (Cloud Run)',
  }),
  envVar({
    name: 'GCP_SERVICE_ACCOUNT_KEY',
    purpose: 'Single-line JSON key of vercel-bpm-invoker, which may invoke the BPM service',
    secret: true,
    source: 'local',
    local: 'required',
    vercel: PROD_DEV,
    group: 'BPM service (Cloud Run)',
  }),
  envVar({
    name: 'BPM_STREAM_BATCH_SIZE',
    purpose: 'Tracks per BPM streaming batch (default 5)',
    source: 'default',
    local: 'optional',
    group: 'BPM service (Cloud Run)',
  }),

  // Deploy (Vercel Blob, through the Vercel Marketplace integration)
  envVar({
    name: 'BLOB_READ_WRITE_TOKEN',
    purpose: 'Vercel Blob token; the deploy keeps its manifest there',
    secret: true,
    source: 'integration',
    local: 'required',
    vercel: ALL_VERCEL,
    group: 'Deploy (Vercel Blob integration)',
  }),
  envVar({
    name: 'DEPLOY_MANIFEST_BLOB_PATH',
    purpose: 'Blob path of the deploy manifest (default deployment-manifests/spotify-playlist-browser.json)',
    source: 'default',
    local: 'optional',
    group: 'Deploy (Vercel Blob integration)',
  }),

  // Optional tuning and links
  envVar({
    name: 'PLAYLIST_CACHE_TTL_MS',
    purpose: 'Playlist cache lifetime in milliseconds',
    source: 'default',
    local: 'optional',
    group: 'Optional tuning and links',
  }),
  envVar({
    name: 'SPOTIFY_FOLLOWERS_CONCURRENCY',
    purpose: 'Parallel Spotify follower-count requests',
    source: 'default',
    local: 'optional',
    group: 'Optional tuning and links',
  }),
  envVar({
    name: 'LOG_LEVEL',
    purpose: 'Server log level (default info)',
    source: 'default',
    local: 'optional',
    group: 'Optional tuning and links',
  }),
  ...['VERCEL_DASHBOARD_URL', 'GCP_LOGS_URL', 'GCP_METRICS_URL', 'SENTRY_DASHBOARD_URL'].map((name) =>
    envVar({
      name,
      purpose: 'Link on the admin observability page (has a generic default)',
      source: 'default',
      local: 'optional',
      group: 'Optional tuning and links',
    })
  ),

  // Set by the platform or passed to scripts; never configured in an env file
  ...['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL_ENV', 'CI'].map((name) =>
    envVar({
      name,
      purpose: 'Set by Node, Next.js or Vercel at run time',
      source: 'platform',
      group: 'Platform',
    })
  ),
  envVar({
    name: 'VERCEL_OIDC_TOKEN',
    purpose: 'Short-lived token Vercel adds to every `vercel env pull`; not read by this repository',
    secret: true,
    source: 'platform',
    group: 'Platform',
  }),
  ...[
    ['DRY_RUN', 'deploy:production prints its plan without changing anything when 1'],
    ['BPM_DEPLOY_FORCE', 'deploy:production redeploys every BPM Cloud Run service, changed or not, when 1'],
    ['PRODUCTION_URL', 'Production URL checked after a deploy (default https://searchmyplaylist.delman.it)'],
    ['NO_COLOR', 'Disables colour in the step runner output'],
  ].map(([name, purpose]) => envVar({ name, purpose, source: 'operator', group: 'Script flags' })),
])

/** Groups that `.env.example` lists, in order; platform and operator names are not configured there. */
const EXAMPLE_GROUPS = Object.freeze([
  'Spotify OAuth',
  'Analytics and error tracking',
  'Database (Neon integration)',
  'BPM service (Cloud Run)',
  'Deploy (Vercel Blob integration)',
  'Optional tuning and links',
])

/** @param {string} name */
function findEnvVar(name) {
  return ENV_CATALOG.find((entry) => entry.name === name)
}

function requiredLocalNames() {
  return ENV_CATALOG.filter((entry) => entry.local === 'required').map((entry) => entry.name)
}

/** Names `.env.example` lists: everything the master `.env.local` may hold. */
function exampleNames() {
  return ENV_CATALOG.filter((entry) => entry.local !== 'none').map((entry) => entry.name)
}

/** Names `env:sync` pushes from the master `.env.local`. */
function syncedNames() {
  return ENV_CATALOG.filter((entry) => entry.source === 'local').map((entry) => entry.name)
}

module.exports = {
  BPM_SERVICE_URL,
  ENV_CATALOG,
  EXAMPLE_GROUPS,
  exampleNames,
  findEnvVar,
  requiredLocalNames,
  syncedNames,
}
