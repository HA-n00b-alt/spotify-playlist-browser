#!/usr/bin/env node
const { runCommand } = require('./lib/exec')

const steps = [
  ['check:env-contract', ['node', ['./scripts/check-env-contract.js']]],
  ['check:api-routes', ['node', ['./scripts/check-api-routes.js']]],
  ['check:runtime-console', ['node', ['./scripts/check-runtime-console.js']]],
  ['check:csp-cloudflare-jsd-filter', ['node', ['./scripts/check-csp-cloudflare-jsd-filter.js']]],
  ['typecheck', ['pnpm', ['exec', 'tsc', '--noEmit']]],
  ['check:strict', ['pnpm', ['exec', 'next', 'lint']]],
  ['test', ['pnpm', ['test']]],
]

function main() {
  for (const [name, [command, args]] of steps) {
    console.log(`\n==> ${name}`)
    runCommand(command, args)
  }

  console.log('\nverify passed')
}

main()
