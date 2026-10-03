import { test } from 'vitest'
const assert = require('node:assert/strict')
const {
  deployAbortMessage,
  deployTreeProblems,
  manifestEntry,
  parsePorcelainPaths,
} = require('../scripts/lib/deploy/guards')

test('parsePorcelainPaths lists staged, unstaged and untracked paths', () => {
  const porcelain = [' M lib/db.ts', 'M  app/page.tsx', 'MM lib/bpm.ts', '?? notes.txt', ''].join('\n')
  assert.deepEqual(parsePorcelainPaths(porcelain), ['lib/db.ts', 'app/page.tsx', 'lib/bpm.ts', 'notes.txt'])
  assert.deepEqual(parsePorcelainPaths(''), [])
})

test('deployTreeProblems accepts a clean main with nothing unpushed', () => {
  assert.deepEqual(deployTreeProblems({ branch: 'main', uncommitted: [], ahead: 0 }), [])
  assert.deepEqual(deployTreeProblems({ branch: 'main', uncommitted: [] }), [])
})

test('deployTreeProblems refuses another branch or a detached HEAD', () => {
  assert.match(deployTreeProblems({ branch: '0013-x', uncommitted: [] })[0], /on `0013-x`, not `main`/)
  assert.match(deployTreeProblems({ branch: 'HEAD', uncommitted: [] })[0], /detached HEAD/)
})

test('deployTreeProblems refuses uncommitted changes and caps the list', () => {
  const uncommitted = Array.from({ length: 25 }, (_, i) => `file${i}.ts`)
  const [problem] = deployTreeProblems({ branch: 'main', uncommitted })
  assert.match(problem, /25 staged, unstaged or untracked/)
  assert.match(problem, /file19\.ts/)
  assert.doesNotMatch(problem, /file20\.ts/)
  assert.match(problem, /and 5 more/)
})

test('deployTreeProblems refuses unpushed commits', () => {
  const problems = deployTreeProblems({ branch: 'main', uncommitted: [], ahead: 2 })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /2 commit\(s\) that `origin\/main` does not/)
})

test('deployTreeProblems reports every problem at once', () => {
  assert.equal(deployTreeProblems({ branch: 'dev', uncommitted: ['a'], ahead: 1 }).length, 3)
})

test('deployAbortMessage names the problems and the way out', () => {
  const message = deployAbortMessage(['The checkout is on `dev`, not `main`.'])
  assert.match(message, /^Deploy aborted/)
  assert.match(message, /on `dev`/)
  assert.match(message, /no longer commits or pushes/)
})

test('manifestEntry records the commit, timestamp and dirty: false', () => {
  assert.deepEqual(
    manifestEntry({ commit: 'abc', timestamp: '2026-10-03T00:00:00.000Z', productionUrl: 'https://x' }),
    {
      timestamp: '2026-10-03T00:00:00.000Z',
      commit: 'abc',
      dirty: false,
      platform: 'vercel',
      productionUrl: 'https://x',
    }
  )
})

test('ipv4Lookup answers both the single-address and the `all` callback shapes', () => {
  const { ipv4Lookup } = require('../scripts/lib/manifest')
  const lookup = ipv4Lookup((_host, callback) => callback(null, ['192.0.2.1', '192.0.2.2']))
  let single
  lookup('blob.example', {}, (...args) => {
    single = args
  })
  assert.deepEqual(single, [null, '192.0.2.1', 4])
  let all
  lookup('blob.example', { all: true }, (...args) => {
    all = args
  })
  assert.deepEqual(all, [null, [{ address: '192.0.2.1', family: 4 }, { address: '192.0.2.2', family: 4 }]])
  const failure = new Error('ENOTFOUND')
  let failed
  ipv4Lookup((_host, callback) => callback(failure))('blob.example', {}, (error) => {
    failed = error
  })
  assert.equal(failed, failure)
})
