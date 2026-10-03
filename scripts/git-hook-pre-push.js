#!/usr/bin/env node
/**
 * The `pre-push` hook (#7): run `verify` when a pushed branch already has an open pull request.
 *
 * Pushes to a branch with no PR are mid-task saves nobody reviews yet, so they skip the gate and
 * cost nothing. A push to a branch with an open PR changes the tree that gets reviewed and merged,
 * so it has to pass `verify` first.
 *
 * - Finding out whether a PR exists needs `gh` and the network. When that cannot be answered, the
 *   push goes ahead and the hook says loudly that verify did NOT run. Failing closed would block
 *   offline work on branches with no PR, which is the common case.
 * - No `node_modules` while a PR is open: the push is refused, never skipped quietly.
 * - `git push --no-verify` skips the hook. The production deploy runs verify itself as the backstop.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
  PR_GATE_RAN_ENV,
  classifyPrLookup,
  parsePrePushRefs,
  pushedBranchNames,
  withoutGitEnv,
} = require('./lib/git/prBoundary')

const PREFIX = 'pre-push'
/** An unreachable API must not hang a push behind a TCP timeout. */
const GH_TIMEOUT_MS = 15_000

/** @param {string[]} lines */
function loud(lines) {
  process.stderr.write(`\n${lines.join('\n')}\n`)
}

const topLevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
if (topLevel.status !== 0) {
  loud([`${PREFIX}: could not find the repository root; the pull-request verify gate did NOT run.`])
  process.exit(0)
}
const repoRoot = topLevel.stdout.trim()

if (process.env[PR_GATE_RAN_ENV] === '1') {
  process.stderr.write(`${PREFIX}: verify already ran in \`npm run pr\` for this push.\n`)
  process.exit(0)
}

let stdin = ''
try {
  stdin = fs.readFileSync(0, 'utf8')
} catch {}
const branches = pushedBranchNames(parsePrePushRefs(stdin))
if (branches.length === 0) process.exit(0)

const ghAvailable = spawnSync('gh', ['--version'], { encoding: 'utf8' }).status === 0
const gated = []
const unknown = []

for (const branch of branches) {
  const result = ghAvailable
    ? spawnSync('gh', ['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number,url'], {
        encoding: 'utf8',
        cwd: repoRoot,
        timeout: GH_TIMEOUT_MS,
      })
    : null
  const lookup = classifyPrLookup({
    available: ghAvailable,
    code: result?.status ?? null,
    stdout: result?.stdout ?? '',
    stderr: result?.stderr ?? '',
  })
  if (lookup.state === 'open') gated.push(branch)
  else if (lookup.state === 'unknown') unknown.push(`${branch}: ${lookup.reason}`)
}

if (gated.length === 0) {
  if (unknown.length > 0) {
    loud([
      `${PREFIX}: SKIPPED the pull-request gate — could not tell whether these branches have an open PR:`,
      ...unknown.map((line) => `    ${line}`),
      '',
      '  NOT RUN: `npm run verify`. The push continues; run verify yourself once `gh` works again.',
      '',
    ])
  }
  process.exit(0)
}

if (!fs.existsSync(path.join(repoRoot, 'node_modules'))) {
  loud([
    `${PREFIX}: PUSH REFUSED — ${gated.join(', ')} has an open pull request, so verify is due,`,
    '  but this checkout has no node_modules and verify cannot run.',
    '',
    '  Fix:',
    '    pnpm install --frozen-lockfile',
    '',
  ])
  process.exit(1)
}

process.stderr.write(`\n${PREFIX}: ${gated.join(', ')} has an open pull request — running verify.\n\n`)

// `npm run`, not `pnpm run`: skips pnpm 11's per-run install check, which fails on undecided build scripts (#22).
// Without git's hook variables, so tests that create their own repositories stay out of this one (#43).
const verify = spawnSync('npm', ['run', '--silent', 'verify'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: withoutGitEnv(process.env),
})
if (verify.status !== 0) {
  loud([
    `${PREFIX}: PUSH REFUSED — verify failed, and this branch has an open pull request.`,
    '',
    '  Fix the failure above and push again. `git push --no-verify` skips this hook if you must',
    '  publish work in progress; the production deploy still runs verify.',
    '',
  ])
  process.exit(verify.status ?? 1)
}

process.stderr.write(`\n${PREFIX}: verify passed.\n\n`)
