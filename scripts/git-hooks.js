#!/usr/bin/env node
/**
 * Install or check the git hooks in `.githooks/` (#7).
 *
 *   node scripts/git-hooks.js install   # the `prepare` script: set core.hooksPath, fix the +x bit
 *   node scripts/git-hooks.js check     # assert only, never writes (used by `npm run pr`)
 *
 * Hooks that are not installed fail silently: git just never runs them. So `install` fails loudly
 * on every problem except one, which is not a problem: there is no git working tree at all (a
 * Vercel build, a tarball install). Then there is nothing to install and it exits 0 saying so.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { EXPECTED_HOOKS, HOOKS_DIR, hookInstallProblems } = require('./lib/git/prBoundary')

/** @param {string[]} args */
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false })
  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

/** @param {string} file */
function inspectHook(file) {
  try {
    if (!fs.statSync(file).isFile()) return { exists: false, executable: false }
  } catch {
    return { exists: false, executable: false }
  }
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return { exists: true, executable: true }
  } catch {
    return { exists: true, executable: false }
  }
}

const mode = process.argv[2] ?? 'check'
if (mode !== 'install' && mode !== 'check') {
  console.error('Usage: node scripts/git-hooks.js <install|check>')
  process.exit(2)
}

const insideWorkTree = git(['rev-parse', '--is-inside-work-tree'])
if (!insideWorkTree.ok || insideWorkTree.stdout !== 'true') {
  if (mode === 'install') {
    console.log('git hooks: not a git working tree, nothing to install.')
    process.exit(0)
  }
  console.error('git hooks: not a git working tree, so the hooks cannot be checked.')
  process.exit(1)
}

const repoRoot = git(['rev-parse', '--show-toplevel']).stdout

if (mode === 'install') {
  const configured = git(['config', 'core.hooksPath', HOOKS_DIR])
  if (!configured.ok) {
    console.error(`git hooks: \`git config core.hooksPath ${HOOKS_DIR}\` failed.\n${configured.stderr}`)
    process.exit(1)
  }
  // Restore a lost executable bit instead of only reporting it; problems left over are reported below.
  for (const { name } of EXPECTED_HOOKS) {
    const file = path.join(repoRoot, HOOKS_DIR, name)
    const state = inspectHook(file)
    if (state.exists && !state.executable) {
      try {
        fs.chmodSync(file, 0o755)
      } catch {}
    }
  }
}

const hooksPath = git(['config', '--get', 'core.hooksPath'])
const problems = hookInstallProblems({
  hooksPath: hooksPath.ok && hooksPath.stdout ? hooksPath.stdout : null,
  hooks: EXPECTED_HOOKS.map(({ name }) => ({ name, ...inspectHook(path.join(repoRoot, HOOKS_DIR, name)) })),
})

if (problems.length > 0) {
  console.error(`\ngit hooks are not installed correctly (${mode}):\n`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\n  Without them no check runs on commit or push, and nothing says so.\n\n  Fix:\n    npm run hooks:install\n')
  process.exit(1)
}

console.log(`git hooks: core.hooksPath=${HOOKS_DIR}; ${EXPECTED_HOOKS.map((h) => h.name).join(', ')} installed.`)
