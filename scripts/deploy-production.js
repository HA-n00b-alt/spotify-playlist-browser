#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { runCommand, runCommandCapture } = require('./lib/exec')
const { ROOT } = require('./lib/env')
const { readManifest, appendDeployment, gitTreeHash, workingTreeHash } = require('./lib/manifest')
const { main: applyMigrations } = require('./apply-migrations')
const { main: syncSecrets } = require('./sync-secrets-vercel')
const { main: postDeployVerify } = require('./post-deploy-verify')

function step(title, fn) {
  console.log(`\n=== ${title} ===`)
  return fn()
}

function gitCommitDeployArtifacts() {
  const files = ['.deploy/manifest.json', '.deploy/applied-migrations.json']
  const existing = files.filter((file) => {
    const { existsSync } = require('node:fs')
    return existsSync(require('node:path').join(ROOT, file))
  })

  if (existing.length === 0) {
    console.log('git: no deploy artifacts to commit')
    return
  }

  spawnSync('git', ['add', ...existing], { cwd: ROOT, stdio: 'inherit' })
  const status = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT })
  if (status.status === 0) {
    console.log('git: deploy artifacts unchanged')
    return
  }

  runCommand('git', [
    'commit',
    '-m',
    'chore(deploy): update production deployment manifest',
  ])

  const branch = runCommandCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT })
  runCommand('git', ['push', 'origin', branch], { cwd: ROOT })
}

async function main() {
  const startedAt = new Date().toISOString()

  step('1/8 verify', () => runCommand('pnpm', ['run', 'verify']))

  await step('2/8 read deployment manifest', async () => {
    const manifest = await readManifest()
    const latest = manifest.deployments?.[manifest.deployments.length - 1]
    console.log(
      latest
        ? `Latest deployment: ${latest.timestamp} (${latest.gitHash})`
        : 'No prior deployments recorded'
    )
  })

  await step('3/8 apply migrations', () => applyMigrations())

  step('4/8 sync secrets to Vercel', () => syncSecrets())

  step('5/8 accessory components', () => {
    console.log('No accessory components for this repository — skipped')
  })

  step('6/8 build and deploy main app', () => {
    runCommand('npx', ['vercel', 'pull', '--yes', '--environment=production'])
    runCommand('npx', ['vercel', 'build', '--prod'])
    runCommand('npx', ['vercel', 'deploy', '--prebuilt', '--prod'])
  })

  await step('7/8 write deployment manifest', async () => {
    await appendDeployment({
      timestamp: startedAt,
      gitHash: gitTreeHash(),
      workingTreeHash: workingTreeHash(),
      platform: 'vercel',
      productionUrl: process.env.PRODUCTION_URL || 'https://searchmyplaylist.delman.it',
    })
    console.log('Manifest updated in Vercel Blob and mirrored to .deploy/manifest.json')
  })

  step('8/8 post-deploy verify and git commit', () => {
    postDeployVerify()
    gitCommitDeployArtifacts()
  })

  console.log('\ndeploy:production completed successfully')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
