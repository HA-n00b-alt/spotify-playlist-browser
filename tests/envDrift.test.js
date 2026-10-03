import { describe, expect, test } from 'vitest'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { hasDrift, localFindings, remoteFindings } = require('../scripts/lib/envDrift')
const { renderEnvExample, scanEnvUsage } = require('../scripts/lib/envDocs')
const { resolveMasterRoot } = require('../scripts/lib/env')

/** @param {Partial<import('../scripts/lib/envCatalog').EnvVar>} entry */
const envVar = (entry) => ({
  purpose: 'p',
  secret: false,
  source: 'local',
  local: 'required',
  vercel: ['production'],
  github: [],
  cloudRun: [],
  group: 'Spotify OAuth',
  ...entry,
})

const statuses = (findings) => Object.fromEntries(findings.map((finding) => [finding.name, finding.status]))

describe('remoteFindings', () => {
  const catalog = [
    envVar({ name: 'SAME' }),
    envVar({ name: 'DIFFERS' }),
    envVar({ name: 'ABSENT' }),
    envVar({ name: 'SENSITIVE', secret: true }),
    envVar({ name: 'NOT_HERE', vercel: [] }),
    envVar({ name: 'HAND_SET', source: 'vercel' }),
    envVar({ name: 'INTEGRATION_COPY', source: 'integration', vercel: [] }),
  ]
  const local = { SAME: 'a', DIFFERS: 'b', ABSENT: 'c', SENSITIVE: 'd', NOT_HERE: 'e' }
  const remote = new Map([
    ['SAME', { value: 'a' }],
    ['DIFFERS', { value: 'other' }],
    ['SENSITIVE', { type: 'sensitive', value: undefined }],
    ['NOT_HERE', { value: 'e' }],
    ['INTEGRATION_COPY', { value: 'x' }],
    ['SOMEONE_ELSES', { value: 'y' }],
  ])
  const targeted = (entry) => entry.vercel.includes('production')

  test('classifies every name without exposing values', () => {
    const findings = remoteFindings({ target: 'vercel/production', targeted, remote, local, catalog })
    expect(statuses(findings)).toEqual({
      SAME: 'unchanged',
      DIFFERS: 'changed',
      ABSENT: 'added',
      SENSITIVE: 'unknown',
      NOT_HERE: 'removed',
      HAND_SET: 'missing',
      INTEGRATION_COPY: 'extra',
      SOMEONE_ELSES: 'extra',
    })
    expect(JSON.stringify(findings)).not.toMatch(/"(a|b|c|d|e|other|x|y)"/)
    expect(hasDrift(findings)).toBe(true)
  })

  test('never marks names on a target owned by another repository as removed', () => {
    const findings = remoteFindings({
      target: 'cloudrun/bpm-service',
      targeted: () => false,
      remote,
      local,
      owned: false,
      catalog,
    })
    expect(findings.every((finding) => finding.status === 'extra')).toBe(true)
    expect(hasDrift(findings)).toBe(false)
  })
})

describe('localFindings', () => {
  test('reports missing required, unlisted and unneeded names', () => {
    const catalog = [envVar({ name: 'NEEDED' }), envVar({ name: 'PULLED', local: 'none' })]
    const findings = localFindings({ PULLED: 'v', STRAY: 'v' }, catalog)
    expect(statuses(findings)).toEqual({ NEEDED: 'missing-required', PULLED: 'not-needed', STRAY: 'unlisted' })
  })
})

describe('env docs', () => {
  test('.env.example rendering lists names with empty values only', () => {
    const rendered = renderEnvExample()
    expect(rendered).toMatch(/^SPOTIFY_CLIENT_SECRET=$/m)
    expect(rendered).not.toMatch(/^[A-Z_][A-Z0-9_]*=.+$/m)
  })

  test('scanEnvUsage finds the names the code reads', () => {
    const usage = scanEnvUsage(path.resolve(__dirname, '..'))
    expect(usage.get('SPOTIFY_CLIENT_ID')).toContain('lib/spotify.ts')
  })
})

describe('parseEnvFile', () => {
  const { parseEnvFile } = require('../scripts/lib/env')

  test('reads the unescaped JSON values `vercel env pull` writes', () => {
    const env = parseEnvFile('A="{"type":"x","k":"a\\nb"}"\nB="plain"\nC=bare\n')
    expect(env).toEqual({ A: '{"type":"x","k":"a\\nb"}', B: 'plain', C: 'bare' })
  })
})

describe('resolveMasterRoot', () => {
  test('resolves the main checkout from a linked worktree', () => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'env-master-')))
    const main = path.join(base, 'main')
    const worktree = path.join(base, 'wt')
    const git = (args, cwd) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr)
    }
    try {
      fs.mkdirSync(main)
      git(['init', '-q'], main)
      git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], main)
      git(['worktree', 'add', '-q', worktree], main)
      expect(resolveMasterRoot(worktree)).toBe(main)
      expect(resolveMasterRoot(main)).toBe(main)
      expect(resolveMasterRoot(base)).toBe(base)
    } finally {
      fs.rmSync(base, { recursive: true, force: true })
    }
  })
})
