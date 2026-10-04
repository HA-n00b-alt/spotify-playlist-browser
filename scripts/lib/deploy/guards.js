/**
 * Pure decisions for `deploy:production`'s pre-flight guards (#13). Adapted from delman-pfm's
 * `assertMainWorktree` / `assertDeployableTree` (`scripts/deploy-production.mjs`), scaled down.
 *
 * Production must run exactly what is on `origin/main`. Until #13 the deploy built whatever was in
 * the working folder, so production ran uncommitted code from 7 June until 3 October 2026.
 *
 * Every rule here is a function of plain values, so it is tested without a git repository.
 */

const DEPLOY_BRANCH = 'main'
const DEPLOY_UPSTREAM = 'origin/main'

/**
 * Parse `git status --porcelain=v1` into the paths it lists. Covers staged, unstaged and untracked
 * changes; ignored files are not listed by git, so `.vercel/` and `.deploy/` never count.
 *
 * @param {string} porcelain
 * @returns {string[]}
 */
function parsePorcelainPaths(porcelain) {
  return String(porcelain ?? '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.slice(3).trim())
}

/**
 * Why the checkout cannot be deployed, one paragraph each. Empty means deployable.
 *
 * `ahead` counts commits on HEAD that `origin/main` does not have. It is checked after the
 * fast-forward, so a positive count means unpushed (or diverged) local commits.
 *
 * @param {{ branch: string; uncommitted: string[]; ahead?: number }} state
 * @returns {string[]}
 */
function deployTreeProblems(state) {
  const problems = []
  if (state.branch !== DEPLOY_BRANCH) {
    problems.push(
      state.branch === 'HEAD'
        ? `The checkout is on a detached HEAD, not \`${DEPLOY_BRANCH}\`.`
        : `The checkout is on \`${state.branch}\`, not \`${DEPLOY_BRANCH}\`.`
    )
  }
  if (state.uncommitted.length > 0) {
    const shown = state.uncommitted.slice(0, 20).map((file) => `  - ${file}`)
    if (state.uncommitted.length > shown.length) {
      shown.push(`  … and ${state.uncommitted.length - shown.length} more`)
    }
    problems.push(
      `The working tree has ${state.uncommitted.length} staged, unstaged or untracked change(s):\n` +
        shown.join('\n')
    )
  }
  if ((state.ahead ?? 0) > 0) {
    problems.push(
      `\`${DEPLOY_BRANCH}\` has ${state.ahead} commit(s) that \`${DEPLOY_UPSTREAM}\` does not.`
    )
  }
  return problems
}

/**
 * The abort message for a non-empty problem list.
 *
 * @param {string[]} problems
 * @returns {string}
 */
function deployAbortMessage(problems) {
  return (
    `Deploy aborted: the checkout is not a clean \`${DEPLOY_BRANCH}\` matching \`${DEPLOY_UPSTREAM}\`.\n\n` +
    `${problems.join('\n\n')}\n\n` +
    `\`${DEPLOY_BRANCH}\` advances only through pull requests, and the deploy no longer commits or ` +
    'pushes on your behalf (#13). Land the work through a pull request (or discard it), pull ' +
    `\`${DEPLOY_BRANCH}\`, then deploy again.`
  )
}

/**
 * The entry appended to the deployment manifest in Vercel Blob. `dirty` is always false: the
 * guards refuse to deploy anything else, and it is recorded so the manifest says so explicitly.
 *
 * `bpmServices` is the content hash of each BPM Cloud Run service as deployed (#59); the next deploy
 * redeploys only the services whose hash changed.
 *
 * @param {{ commit: string; timestamp: string; productionUrl: string; bpmServices?: Record<string, string> }} input
 */
function manifestEntry(input) {
  return {
    timestamp: input.timestamp,
    commit: input.commit,
    dirty: false,
    platform: 'vercel',
    productionUrl: input.productionUrl,
    ...(input.bpmServices ? { bpmServices: input.bpmServices } : {}),
  }
}

module.exports = {
  DEPLOY_BRANCH,
  DEPLOY_UPSTREAM,
  deployAbortMessage,
  deployTreeProblems,
  manifestEntry,
  parsePorcelainPaths,
}
