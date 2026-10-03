#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { runCommand, runCommandCapture } = require('./lib/exec')
const { ROOT } = require('./lib/env')
const { readManifest, appendDeployment, gitTreeHash, workingTreeHash } = require('./lib/manifest')
const { main: applyMigrations } = require('./apply-migrations')
const { main: syncSecrets } = require('./sync-secrets-vercel')
const { main: postDeployVerify } = require('./post-deploy-verify')
const { runPipeline } = require('./lib/stepRunner')
const { runVerifySteps } = require('./lib/verify/verifySteps')

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

async function main(runner) {
  const startedAt = new Date().toISOString()

  runVerifySteps(runner)

  await runner.step('read deployment manifest', async () => {
    const manifest = await readManifest()
    const latest = manifest.deployments?.[manifest.deployments.length - 1]
    console.log(
      latest
        ? `Latest deployment: ${latest.timestamp} (${latest.gitHash})`
        : 'No prior deployments recorded'
    )
  })

  await runner.step('apply migrations', () => applyMigrations())

  await runner.step('sync secrets to Vercel', () => syncSecrets())

  runner.skip('accessory components', 'none for this repository')

  await runner.step('build and deploy main app', () => {
    runCommand('npx', ['vercel', 'pull', '--yes', '--environment=production'])
    runCommand('npx', ['vercel', 'build', '--prod'])
    runCommand('npx', ['vercel', 'deploy', '--prebuilt', '--prod'])
  })

  await runner.step('write deployment manifest', async () => {
    await appendDeployment({
      timestamp: startedAt,
      gitHash: gitTreeHash(),
      workingTreeHash: workingTreeHash(),
      platform: 'vercel',
      productionUrl: process.env.PRODUCTION_URL || 'https://searchmyplaylist.delman.it',
    })
    console.log('Manifest updated in Vercel Blob and mirrored to .deploy/manifest.json')
  })

  await runner.step('post-deploy verify', () => postDeployVerify())

  await runner.step('git commit deploy artifacts', () => gitCommitDeployArtifacts())
}

runPipeline('deploy:production', main)
