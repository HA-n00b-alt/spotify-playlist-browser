#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./lib/env')

const ALLOWLIST = new Set([
  path.join(ROOT, 'lib', 'logger.ts'),
])

const CONSOLE_PATTERN = /\bconsole\.(log|debug|info|warn|error)\(/

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

function main() {
  const targets = ['app/api', 'app/actions', 'lib'].map((dir) => path.join(ROOT, dir))
  const violations = []

  for (const target of targets) {
    if (!fs.existsSync(target)) continue
    for (const file of walk(target)) {
      if (ALLOWLIST.has(file)) continue
      const content = fs.readFileSync(file, 'utf8')
      if (CONSOLE_PATTERN.test(content)) {
        violations.push(path.relative(ROOT, file))
      }
    }
  }

  if (violations.length > 0) {
    console.error('check:runtime-console failed — use lib/logger instead of console.*:')
    for (const file of violations) {
      console.error(`  - ${file}`)
    }
    process.exit(1)
  }

  console.log('check:runtime-console passed')
}

main()
