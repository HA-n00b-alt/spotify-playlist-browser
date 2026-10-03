#!/usr/bin/env node
/**
 * `pnpm run deploy:production` — deploys a clean, pushed `main` to Vercel (#13).
 *
 * Before anything changes, the guards require the checkout to be on `main` with no staged,
 * unstaged or untracked changes, fast-forward it from `origin/main`, and refuse unpushed commits.
 * The deploy records the commit in the Vercel Blob manifest and never commits or pushes.
 *
 * `DRY_RUN=1` prints the plan and the guard verdict without fetching, building or writing anything.
 */
const { spawnSync } = require('node:child_process')
const { runCommand, runCommandCapture } = require('./lib/exec')
const { ROOT } = require('./lib/env')
const { readManifest, appendDeployment } = require('./lib/manifest')
const { main: applyMigrations } = require('./apply-migrations')
const { main: syncSecrets } = require('./sync-secrets-vercel')
const { main: postDeployVerify } = require('./post-deploy-verify')
const {
  DEPLOY_UPSTREAM,
  deployAbortMessage,
  deployTreeProblems,
  manifestEntry,
  parsePorcelainPaths,
} = require('./lib/deploy/guards')
const { runPipeline } = require('./lib/stepRunner')
const { runVerifySteps } = require('./lib/verify/verifySteps')

const DRY_RUN = process.env.DRY_RUN === '1'
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://searchmyplaylist.delman.it'

const PLAN = [
  'guard: on `main` with no staged, unstaged or untracked changes',
  `fast-forward from ${DEPLOY_UPSTREAM}; abort on unpushed or diverged commits`,
  'verify',
  'read deployment manifest (Vercel Blob)',
  'apply migrations',
  'sync secrets to Vercel',
  'guard: working tree still clean',
  'build and deploy main app (vercel pull, build --prod, deploy --prebuilt --prod)',
  'append { commit, timestamp, dirty: false } to the deployment manifest (Vercel Blob only)',
  'post-deploy verify',
]

/** @param {string[]} args */
function git(args) {
  return runCommandCapture('git', args, { cwd: ROOT })
}

/** `git status --porcelain` read untrimmed: its leading status column is significant. */
function uncommittedPaths() {
  const result = spawnSync('git', ['status', '--porcelain=v1'], { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git status failed: ${result.stderr}`)
  return parsePorcelainPaths(result.stdout)
}

/** @param {number} [ahead] */
function checkoutState(ahead) {
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    uncommitted: uncommittedPaths(),
    ahead,
  }
}

function commitsAheadOfUpstream() {
  return Number(git(['rev-list', '--count', `${DEPLOY_UPSTREAM}..HEAD`]))
}

/** Abort on any problem; under DRY_RUN, report what would abort and carry on. */
function enforce(problems) {
  if (problems.length === 0) return
  const message = deployAbortMessage(problems)
  if (DRY_RUN) {
    console.warn(`WOULD ABORT — ${message}`)
    return
  }
  throw new Error(message)
}

async function main(runner) {
  const startedAt = new Date().toISOString()

  console.log(`Plan${DRY_RUN ? ' (DRY_RUN: nothing will be changed)' : ''}:`)
  PLAN.forEach((line, index) => console.log(`  ${index + 1}. ${line}`))
  console.log('')

  if (DRY_RUN) {
    await runner.step(`guard: clean main checkout (vs last-fetched ${DEPLOY_UPSTREAM})`, () => {
      enforce(deployTreeProblems(checkoutState(commitsAheadOfUpstream())))
      const behind = Number(git(['rev-list', '--count', `HEAD..${DEPLOY_UPSTREAM}`]))
      console.log(`Would fast-forward ${behind} commit(s); the real run fetches first.`)
    })
    for (const label of PLAN.slice(1)) runner.skip(label, 'DRY_RUN')
    return
  }

  await runner.step('guard: clean main checkout', () => enforce(deployTreeProblems(checkoutState())))

  const commit = await runner.step(`fast-forward from ${DEPLOY_UPSTREAM}`, () => {
    runCommand('git', ['fetch', 'origin', 'main'], { cwd: ROOT })
    enforce(deployTreeProblems(checkoutState(commitsAheadOfUpstream())))
    runCommand('git', ['merge', '--ff-only', DEPLOY_UPSTREAM], { cwd: ROOT })
    const head = git(['rev-parse', 'HEAD'])
    console.log(`Deploying ${head}`)
    return head
  })

  runVerifySteps(runner)

  await runner.step('read deployment manifest', async () => {
    const manifest = await readManifest()
    const latest = manifest.deployments?.[manifest.deployments.length - 1]
    console.log(
      latest
        ? `Latest deployment: ${latest.timestamp} (${latest.commit ?? latest.gitHash})`
        : 'No prior deployments recorded'
    )
  })

  await runner.step('apply migrations', () => applyMigrations())

  await runner.step('sync secrets to Vercel', () => syncSecrets())

  runner.skip('accessory components', 'none for this repository')

  await runner.step('guard: working tree still clean', () => {
    enforce(deployTreeProblems(checkoutState()))
    if (git(['rev-parse', 'HEAD']) !== commit) throw new Error('HEAD moved during the deploy')
  })

  await runner.step('build and deploy main app', () => {
    runCommand('npx', ['vercel', 'pull', '--yes', '--environment=production'])
    runCommand('npx', ['vercel', 'build', '--prod'])
    runCommand('npx', ['vercel', 'deploy', '--prebuilt', '--prod'])
  })

  await runner.step('write deployment manifest', async () => {
    await appendDeployment(manifestEntry({ commit, timestamp: startedAt, productionUrl: PRODUCTION_URL }))
    console.log(`Manifest updated in Vercel Blob: ${commit}`)
  })

  await runner.step('post-deploy verify', () => postDeployVerify())
}

runPipeline('deploy:production', main)
