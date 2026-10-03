#!/usr/bin/env node
/**
 * `node scripts/with-master-env.js <command> [args…]` — run a command with the master `.env.local`
 * in its environment (#31, ADR 0004).
 *
 * In a worktree, Next.js finds no `.env.local`, so `pnpm dev` would start without credentials.
 * This passes the main checkout's values to the child process instead, so nothing is copied or
 * linked into the worktree and nothing is printed. In the main checkout it adds nothing: Next.js
 * reads `.env.local` itself.
 */
const { spawn } = require('node:child_process')
const { MASTER_ROOT, ROOT, masterEnvForChild } = require('./lib/env')

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('usage: with-master-env.js <command> [args…]')
  process.exit(2)
}

const masterEnv = masterEnvForChild()
const loaded = Object.keys(masterEnv).length
if (loaded > 0) {
  console.log(`with-master-env: ${loaded} variable(s) from ${MASTER_ROOT}/.env.local`)
} else if (MASTER_ROOT !== ROOT) {
  console.warn(`with-master-env: no .env.local in the main checkout (${MASTER_ROOT})`)
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: { ...masterEnv, ...process.env },
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
