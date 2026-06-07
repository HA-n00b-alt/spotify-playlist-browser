const { spawnSync } = require('node:child_process')

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`)
  }
}

function runCommandCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    encoding: 'utf8',
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim()
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(' ')}\n${stderr}`
    )
  }

  return (result.stdout || '').trim()
}

module.exports = {
  runCommand,
  runCommandCapture,
}
