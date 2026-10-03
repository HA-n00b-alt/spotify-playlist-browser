#!/usr/bin/env node
/**
 * `npm run pr` — deliver the current branch as a pull request (#7).
 *
 * The AGENTS.md delivery steps as one command, so verify is part of delivering instead of something
 * to remember: check the hooks are installed → verify → check the branch still merges into
 * `origin/<base>` → push → open the pull request from `.github/pull_request_template.md`.
 *
 * With a PR already open on the branch it verifies and pushes, then reports that PR.
 *
 *   npm run pr                                     # title from the branch's only commit
 *   npm run pr -- --title "fix(auth): … (#10)"     # required when the branch has several commits
 *   npm run pr -- --body-file body.md              # your own body instead of the template
 *   npm run pr -- --dry-run                        # print the plan, touch nothing
 *   npm run pr -- --base other-branch              # stacked PR
 *
 * Other flags are passed through to `gh pr create`.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { StepError, runPipeline } = require('./lib/stepRunner')
const { PR_GATE_RAN_ENV, classifyPrLookup, fillPrTemplate, issueNumberFromBranch } = require('./lib/git/prBoundary')

const TEMPLATE = path.join('.github', 'pull_request_template.md')

/** @param {string} message */
function fail(message) {
  process.stderr.write(`npm run pr: ${message}\n`)
  process.exit(1)
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} [cwd]
 */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd })
  return {
    ok: !result.error && result.status === 0,
    available: !(result.error && result.error.code === 'ENOENT'),
    code: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const parsed = { dryRun: false, base: 'main', title: '', passthrough: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') parsed.dryRun = true
    else if (arg === '--base') parsed.base = argv[++i] ?? parsed.base
    else if (arg.startsWith('--base=')) parsed.base = arg.slice('--base='.length)
    else if (arg === '--title') parsed.title = argv[++i] ?? ''
    else if (arg.startsWith('--title=')) parsed.title = arg.slice('--title='.length)
    else parsed.passthrough.push(arg)
  }
  return parsed
}

const options = parseArgs(process.argv.slice(2))

const topLevel = run('git', ['rev-parse', '--show-toplevel'])
if (!topLevel.ok) fail('not inside a git repository.')
const repoRoot = topLevel.stdout

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout
if (!branch || branch === 'HEAD') fail('HEAD is detached; check out the task branch first.')
if (branch === options.base) {
  fail(`HEAD is \`${branch}\`, the base branch. Work on an issue branch in a worktree (AGENTS.md).`)
}

const dirty = run('git', ['status', '--porcelain']).stdout
if (dirty) {
  fail(`uncommitted changes would not be in the pull request — commit them first:\n\n${dirty}\n`)
}

/** @returns {Array<{ number: number; url: string }>} */
function openPullRequests() {
  const result = run('gh', ['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number,url'], repoRoot)
  const lookup = classifyPrLookup(result)
  if (lookup.state === 'unknown') {
    throw new StepError(`could not look up pull requests for ${branch}: ${lookup.reason}`, { label: 'pull request' })
  }
  return lookup.state === 'open' ? lookup.prs : []
}

let existing
try {
  existing = openPullRequests()
} catch (error) {
  fail(error.message)
}

const hasBody = options.passthrough.some((arg) => /^--(body|body-file|fill|fill-first|fill-verbose|web|template)\b/.test(arg))
let title = options.title
if (existing.length === 0 && !title) {
  const subjects = run('git', ['log', '--format=%s', `origin/${options.base}..HEAD`]).stdout
  const commits = subjects ? subjects.split('\n') : []
  if (commits.length !== 1) {
    fail(`the branch has ${commits.length} commits ahead of origin/${options.base}; pass --title "<type(scope): summary (#N)>".`)
  }
  title = commits[0]
}

const issue = issueNumberFromBranch(branch)

if (options.dryRun) {
  console.log(
    [
      'npm run pr — plan (nothing run):',
      `  branch  ${branch} → ${options.base}`,
      '  1. check git hooks are installed',
      '  2. npm run verify',
      `  3. git fetch origin ${options.base}; check the branch merges cleanly`,
      `  4. git push -u origin ${branch}`,
      existing.length > 0
        ? `  5. report the open pull request ${existing[0].url}`
        : `  5. gh pr create --title "${title}" ${hasBody ? '(your body)' : `(template, Closes #${issue ?? '?'})`}`,
    ].join('\n')
  )
  process.exit(0)
}

runPipeline('pr', async (runner) => {
  runner.command('git hooks installed', {
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts', 'git-hooks.js'), 'check'],
    cwd: repoRoot,
  })

  // `npm run`, not `pnpm run`: pnpm 11 fails every `pnpm run` on unapproved build scripts (#22).
  runner.command('verify', { command: 'npm', args: ['run', '--silent', 'verify'], cwd: repoRoot, stream: true })

  runner.command(`fetch origin/${options.base}`, { command: 'git', args: ['fetch', 'origin', options.base], cwd: repoRoot })
  runner.command(`merges cleanly into origin/${options.base}`, {
    command: 'git',
    args: ['merge-tree', '--write-tree', '--name-only', `origin/${options.base}`, 'HEAD'],
    cwd: repoRoot,
  })

  runner.command(`push ${branch}`, {
    command: 'git',
    args: ['push', '-u', 'origin', branch],
    cwd: repoRoot,
    env: { ...process.env, [PR_GATE_RAN_ENV]: '1' },
    stream: true,
  })

  if (existing.length > 0) {
    console.log(`\nupdated pull request #${existing[0].number}: ${existing[0].url}`)
    return
  }

  const url = await runner.step('open pull request', () => {
    const args = ['pr', 'create', '--base', options.base, '--head', branch, '--title', title, ...options.passthrough]
    if (!hasBody) {
      const template = fs.readFileSync(path.join(repoRoot, TEMPLATE), 'utf8')
      const bodyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-')), 'body.md')
      fs.writeFileSync(bodyFile, fillPrTemplate(template, issue))
      args.push('--body-file', bodyFile)
    }
    const created = run('gh', args, repoRoot)
    if (!created.ok) throw new Error(`gh pr create failed: ${created.stderr || `exit ${created.code}`}`)
    // Confirm through the same lookup instead of trusting gh's stdout.
    const confirmed = openPullRequests()
    if (confirmed.length === 0) throw new Error('gh pr create exited 0 but no open pull request was found')
    return confirmed[0].url
  })

  console.log(`\nopened ${url}`)
  if (!hasBody) {
    console.log(
      `Fill in the body: ${issue ? `\`Closes #${issue}\` is set; ` : 'add `Closes #<issue>`; '}` +
        'write the Summary, tick the Definition of Done honestly and list the Validation actually run.'
    )
  }
})
