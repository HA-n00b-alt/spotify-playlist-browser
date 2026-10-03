/**
 * Pure helpers for the git hooks and `npm run pr` (#7). Adapted from delman-pfm's
 * `scripts/lib/git/prBoundary.mjs`, scaled down.
 *
 * `verify` runs where a pull request is opened or updated: `npm run pr` runs it before pushing a new
 * PR, and `.githooks/pre-push` runs it when a plain `git push` updates a branch that already has an
 * open PR. Every decision both of them make is a pure function of text in this file, so it is tested
 * without a git repository, a network or `gh`.
 */

const HOOKS_DIR = '.githooks'

/**
 * The hooks `scripts/git-hooks.js` installs and checks, and what each one is for.
 *
 * @type {ReadonlyArray<{ name: string; purpose: string }>}
 */
const EXPECTED_HOOKS = Object.freeze([
  { name: 'pre-commit', purpose: 'migration file numbering in migrations/' },
  { name: 'pre-push', purpose: '`verify` when the pushed branch has an open pull request' },
])

/** Set on the push `npm run pr` makes, so `pre-push` does not re-run the verify it just ran. */
const PR_GATE_RAN_ENV = 'SPB_PR_GATE_RAN'

/** git uses an all-zero object id for a ref that does not exist; on the local side, a delete. */
const ZERO_SHA_RE = /^0+$/

/**
 * Parse the `pre-push` hook's stdin: one `<local ref> <local sha> <remote ref> <remote sha>` per line.
 *
 * @param {string} stdin
 * @returns {Array<{ localRef: string; localSha: string; remoteRef: string; remoteSha: string }>}
 */
function parsePrePushRefs(stdin) {
  const refs = []
  for (const rawLine of String(stdin ?? '').split('\n')) {
    const [localRef, localSha, remoteRef, remoteSha] = rawLine.trim().split(/\s+/)
    if (!remoteRef) continue
    refs.push({ localRef, localSha: localSha ?? '', remoteRef, remoteSha: remoteSha ?? '' })
  }
  return refs
}

/**
 * The branches this push creates or updates on the remote, without duplicates. Deletions and
 * non-branch refs (tags) are dropped: neither can update the head of an open pull request.
 *
 * @param {ReturnType<typeof parsePrePushRefs>} refs
 * @returns {string[]}
 */
function pushedBranchNames(refs) {
  const names = []
  for (const ref of refs) {
    if (ZERO_SHA_RE.test(ref.localSha)) continue
    const match = /^refs\/heads\/(.+)$/.exec(ref.remoteRef)
    if (match && !names.includes(match[1])) names.push(match[1])
  }
  return names
}

/**
 * Classify a `gh pr list --state open --head <branch> --json …` run.
 *
 * `unknown` means the question could not be answered (no `gh`, not logged in, offline, odd output).
 * The caller must say so out loud rather than treat it as either "no PR" or "PR open".
 *
 * @param {{ available: boolean; code?: number | null; stdout?: string; stderr?: string }} result
 * @returns {{ state: 'open'; prs: Array<Record<string, unknown>> } | { state: 'none' } | { state: 'unknown'; reason: string }}
 */
function classifyPrLookup(result) {
  if (!result.available) return { state: 'unknown', reason: 'the `gh` CLI is not on PATH' }
  if (result.code !== 0) {
    const firstLine = String(result.stderr ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
    return { state: 'unknown', reason: firstLine || `\`gh\` exited with status ${result.code}` }
  }
  let parsed
  try {
    parsed = JSON.parse(result.stdout || '[]')
  } catch {
    return { state: 'unknown', reason: '`gh` returned output that is not JSON' }
  }
  if (!Array.isArray(parsed)) {
    return { state: 'unknown', reason: '`gh` returned JSON that is not a list of pull requests' }
  }
  return parsed.length > 0 ? { state: 'open', prs: parsed } : { state: 'none' }
}

/**
 * Problems with the installed hooks, one line each. Empty means healthy.
 *
 * @param {{ hooksPath: string | null; hooks: Array<{ name: string; exists: boolean; executable: boolean }> }} state
 * @returns {string[]}
 */
function hookInstallProblems(state) {
  const problems = []
  if (state.hooksPath !== HOOKS_DIR) {
    problems.push(
      state.hooksPath
        ? `core.hooksPath is \`${state.hooksPath}\`, expected \`${HOOKS_DIR}\``
        : `core.hooksPath is not set, so git runs none of the hooks in ${HOOKS_DIR}/`
    )
  }
  for (const hook of state.hooks) {
    if (!hook.exists) problems.push(`${HOOKS_DIR}/${hook.name} is missing`)
    else if (!hook.executable) problems.push(`${HOOKS_DIR}/${hook.name} is not executable, so git skips it`)
  }
  return problems
}

/**
 * The issue number a branch is named after: `0007-claude-git-hooks` → 7.
 *
 * @param {string} branch
 * @returns {number | null}
 */
function issueNumberFromBranch(branch) {
  const match = /^(\d{4})-/.exec(branch)
  const number = match ? Number(match[1]) : 0
  return number > 0 ? number : null
}

/**
 * The pull request template with its `Closes #` line pointing at the issue.
 *
 * @param {string} template contents of `.github/pull_request_template.md`
 * @param {number | null} issue
 * @returns {string}
 */
function fillPrTemplate(template, issue) {
  if (issue === null) return template
  return template.replace(/^Closes #\s*$/m, `Closes #${issue}`)
}

/**
 * `env` without the `GIT_*` variables git sets for a hook (`GIT_DIR`, `GIT_INDEX_FILE`, …).
 *
 * A hook's children inherit them, so a test that runs `git init` or `git commit` in a temp dir
 * acts on the pushing repository instead: it once committed onto the pushed branch and set
 * `core.bare = true` on the main checkout (#43). Verify must run as if started from a shell.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
function withoutGitEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('GIT_')))
}

module.exports = {
  EXPECTED_HOOKS,
  HOOKS_DIR,
  PR_GATE_RAN_ENV,
  classifyPrLookup,
  fillPrTemplate,
  hookInstallProblems,
  issueNumberFromBranch,
  parsePrePushRefs,
  pushedBranchNames,
  withoutGitEnv,
}
