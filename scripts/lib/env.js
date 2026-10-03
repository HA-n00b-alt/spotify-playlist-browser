/**
 * Where the env files live, and how scripts read them (#31, ADR 0004).
 *
 * `ROOT` is the checkout this script runs from: the main checkout or a worktree under
 * `.claude/worktrees/`. `MASTER_ROOT` is always the main checkout, which holds the gitignored
 * master copies of the local secret files (`.env.local`, the GCP service-account key). Scripts
 * read secrets from `MASTER_ROOT`, so a worktree never needs, and never gets, its own copy.
 * Tracked files such as `.env.example` come from `ROOT`, the branch being worked on.
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..', '..')

/**
 * The main checkout: the parent of the shared git directory. Falls back to `ROOT` outside git
 * (a Vercel build, an unpacked tarball).
 *
 * @param {string} [cwd]
 * @returns {string}
 */
function resolveMasterRoot(cwd = ROOT) {
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
  })
  if (result.status !== 0 || !result.stdout.trim()) return cwd
  const commonDir = result.stdout.trim()
  return path.basename(commonDir) === '.git' ? path.dirname(commonDir) : cwd
}

const MASTER_ROOT = resolveMasterRoot()
const ENV_LOCAL = path.join(MASTER_ROOT, '.env.local')
const ENV_EXAMPLE = path.join(ROOT, '.env.example')
const GCP_KEY_FILE = path.join(MASTER_ROOT, 'vercel-bpm-invoker-delman-site.json')

function parseEnvFile(content) {
  const env = {}
  let index = 0

  while (index < content.length) {
    while (index < content.length && (content[index] === '\n' || content[index] === '\r')) {
      index += 1
    }
    if (index >= content.length) break

    if (content[index] === '#') {
      while (index < content.length && content[index] !== '\n') index += 1
      continue
    }

    const keyStart = index
    while (index < content.length && content[index] !== '=' && content[index] !== '\n') {
      index += 1
    }
    if (index >= content.length || content[index] !== '=') break

    const key = content.slice(keyStart, index).trim()
    index += 1

    // `vercel env pull` writes JSON values as "{"type":…}" without escaping the inner quotes: when
    // a quoted value's line ends in a quote with more quotes inside, take it verbatim.
    let lineEnd = content.indexOf('\n', index)
    if (lineEnd === -1) lineEnd = content.length
    const rawLine = content.slice(index, lineEnd).replace(/\r$/, '').trimEnd()
    if (
      rawLine.length > 1 &&
      rawLine.startsWith('"') &&
      rawLine.endsWith('"') &&
      /(?<!\\)"/.test(rawLine.slice(1, -1))
    ) {
      env[key] = rawLine.slice(1, -1)
      index = lineEnd
      continue
    }

    if (content[index] === '"') {
      index += 1
      let value = ''
      while (index < content.length) {
        const char = content[index]
        if (char === '\\' && index + 1 < content.length) {
          value += content[index + 1]
          index += 2
          continue
        }
        if (char === '"') {
          index += 1
          break
        }
        value += char
        index += 1
      }
      env[key] = value
      continue
    }

    const valueStart = index
    while (index < content.length && content[index] !== '\n' && content[index] !== '\r') {
      index += 1
    }
    env[key] = content.slice(valueStart, index).trim()
  }

  return env
}

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL)) {
    throw new Error(
      `Missing ${ENV_LOCAL} — the master .env.local lives in the main checkout; ` +
        'create it there from .env.example (see INSTALL.md)'
    )
  }

  return parseEnvFile(fs.readFileSync(ENV_LOCAL, 'utf8'))
}

function loadEnvExample() {
  if (!fs.existsSync(ENV_EXAMPLE)) {
    throw new Error('Missing .env.example')
  }

  const env = {}
  for (const line of fs.readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

/**
 * The master `.env.local` as a child-process environment, for commands Next.js runs from a
 * worktree (`with-master-env.js`). Values already in `process.env` win, matching Next.js.
 * Empty when the checkout is the main one: Next.js reads its own `.env.local` there.
 *
 * @returns {Record<string, string>}
 */
function masterEnvForChild() {
  if (MASTER_ROOT === ROOT || !fs.existsSync(ENV_LOCAL)) return {}
  return parseEnvFile(fs.readFileSync(ENV_LOCAL, 'utf8'))
}

module.exports = {
  ROOT,
  MASTER_ROOT,
  ENV_LOCAL,
  ENV_EXAMPLE,
  GCP_KEY_FILE,
  resolveMasterRoot,
  parseEnvFile,
  loadEnvLocal,
  loadEnvExample,
  masterEnvForChild,
}
