/**
 * Step runner shared by `verify` and `deploy:production` (#6). Adapted from delman-pfm's
 * `scripts/lib/deploy/stepRunner.mjs`, scaled down.
 *
 * Every step renders the same way: a start line, then one PASS/FAIL line with its duration. A
 * final summary rolls up the counts and total time and, on failure, names the failed step last.
 *
 * Two command modes:
 * - buffered (default): stdout+stderr go to a temporary log file. On success the log is deleted
 *   and nothing is shown; on failure the tail of the log is printed and the file is kept.
 * - streamed (`stream: true`): the child inherits the terminal, for steps whose own output is the
 *   point (builds, deploys, migrations).
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const TAIL_BYTES = 16 * 1024

/**
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes}m${String(remainder).padStart(2, '0')}s`
}

/** Raised when a step fails; carries the child exit code so the pipeline can exit with it. */
class StepError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: number; label?: string; logPath?: string }} [details]
   */
  constructor(message, details = {}) {
    super(message)
    this.name = 'StepError'
    this.code = details.code ?? 1
    this.label = details.label ?? ''
    this.logPath = details.logPath ?? ''
  }
}

/**
 * Read the last `bytes` of a file as text, noting how much was left out.
 *
 * @param {string} filePath
 * @param {number} bytes
 * @returns {string}
 */
function readTail(filePath, bytes) {
  const size = fs.statSync(filePath).size
  if (size === 0) return ''
  const length = Math.min(size, bytes)
  const buffer = Buffer.alloc(length)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, buffer, 0, length, size - length)
  } finally {
    fs.closeSync(fd)
  }
  const omitted = length < size ? `… (${size - length} earlier bytes omitted)\n` : ''
  return omitted + buffer.toString('utf8')
}

/**
 * @param {import('node:child_process').SpawnSyncReturns<unknown>} result
 * @returns {string}
 */
function describeExit(result) {
  if (result.error) return `could not start (${result.error.message})`
  return result.signal ? `was killed by ${result.signal}` : `exited with status ${result.status}`
}

class StepRunner {
  /**
   * @param {{ title?: string; out?: NodeJS.WritableStream; color?: boolean }} [options]
   */
  constructor(options = {}) {
    this.title = options.title ?? ''
    this.out = options.out ?? process.stdout
    this.useColor = options.color ?? (Boolean(this.out.isTTY) && !process.env.NO_COLOR)
    /** @type {Array<{ label: string; status: 'pass' | 'fail' | 'skip'; ms: number }>} */
    this.steps = []
    this.startedAt = Date.now()
    /** @type {{ label: string; logPath?: string } | null} */
    this.failure = null
  }

  /**
   * Run a child command as a step.
   *
   * @param {string} label
   * @param {{ command: string; args?: string[]; cwd?: string; env?: NodeJS.ProcessEnv; stream?: boolean }} spec
   */
  command(label, spec) {
    const { command, args = [], cwd, env, stream = false } = spec
    const commandLine = [command, ...args].join(' ')
    this._start(label)
    const startedAt = Date.now()

    if (stream) {
      const result = spawnSync(command, args, { cwd, env, shell: false, stdio: 'inherit' })
      if (result.error || result.status !== 0) {
        this._fail(label, Date.now() - startedAt, `\`${commandLine}\` ${describeExit(result)}.`)
        throw new StepError(`Step "${label}" failed`, { code: result.status ?? 1, label })
      }
      this._finish('pass', label, Date.now() - startedAt)
      return result
    }

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'step-'))
    const logPath = path.join(directory, 'output.log')
    const logFd = fs.openSync(logPath, 'w')
    let result
    try {
      result = spawnSync(command, args, {
        cwd,
        env,
        shell: false,
        stdio: ['ignore', logFd, logFd],
      })
    } finally {
      fs.closeSync(logFd)
    }

    if (result.error || result.status !== 0) {
      const tail = readTail(logPath, TAIL_BYTES)
      const detail = [
        `\`${commandLine}\` ${describeExit(result)}.`,
        tail ? `Output:\n${tail}` : '',
        `Full log: ${logPath}`,
      ]
        .filter(Boolean)
        .join('\n')
      this._fail(label, Date.now() - startedAt, detail, logPath)
      throw new StepError(`Step "${label}" failed`, { code: result.status ?? 1, label, logPath })
    }

    fs.rmSync(directory, { force: true, recursive: true })
    this._finish('pass', label, Date.now() - startedAt)
    return result
  }

  /**
   * Run a function as a step. Its output streams straight to the terminal.
   *
   * @template T
   * @param {string} label
   * @param {() => T | Promise<T>} fn
   * @returns {Promise<T>}
   */
  async step(label, fn) {
    this._start(label)
    const startedAt = Date.now()
    try {
      const value = await fn()
      this._finish('pass', label, Date.now() - startedAt)
      return value
    } catch (error) {
      if (error instanceof StepError) {
        // A nested runner.command() already printed its own failure.
        this._finish('fail', label, Date.now() - startedAt)
        throw error
      }
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
      this._fail(label, Date.now() - startedAt, detail)
      throw new StepError(`Step "${label}" failed`, { code: 1, label })
    }
  }

  /**
   * Record a skipped step.
   *
   * @param {string} label
   * @param {string} [note]
   */
  skip(label, note) {
    const suffix = note ? `  (${note})` : ''
    this._write(`${this._color('SKIP', 'yellow')} ${label}${suffix}\n`)
    this.steps.push({ label, status: 'skip', ms: 0 })
  }

  /** @returns {string} */
  summary() {
    const count = (status) => this.steps.filter((s) => s.status === status).length
    const parts = [`${count('pass')} passed`]
    if (count('skip') > 0) parts.push(`${count('skip')} skipped`)
    if (count('fail') > 0) parts.push(`${count('fail')} failed`)
    const total = formatDuration(Date.now() - this.startedAt)
    return `${this.title ? `${this.title}: ` : ''}${parts.join(', ')}  (${total})`
  }

  printSummary() {
    this._write(`\n${this.summary()}\n`)
    if (this.failure) {
      const log = this.failure.logPath ? ` — full log: ${this.failure.logPath}` : ''
      this._write(`${this._color(`Failed at: ${this.failure.label}${log}`, 'red')}\n`)
    }
  }

  /** @param {string} label */
  _start(label) {
    this._write(`${this._color('▶', 'dim')} ${label} …\n`)
  }

  /**
   * @param {'pass' | 'fail'} status
   * @param {string} label
   * @param {number} ms
   */
  _finish(status, label, ms) {
    const mark = status === 'pass' ? this._color('PASS', 'green') : this._color('FAIL', 'red')
    this._write(`${mark} ${label}  ${this._color(`(${formatDuration(ms)})`, 'dim')}\n`)
    this.steps.push({ label, status, ms })
  }

  /**
   * @param {string} label
   * @param {number} ms
   * @param {string} detail
   * @param {string} [logPath]
   */
  _fail(label, ms, detail, logPath) {
    this._finish('fail', label, ms)
    const indented = detail
      .replace(/\s+$/u, '')
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
    this._write(`${indented}\n`)
    this.failure = { label, ...(logPath ? { logPath } : {}) }
  }

  /**
   * @param {string} text
   * @param {'red' | 'green' | 'yellow' | 'dim'} name
   */
  _color(text, name) {
    if (!this.useColor) return text
    const codes = { red: 31, green: 32, yellow: 33, dim: 2 }
    return `\u001b[${codes[name]}m${text}\u001b[0m`
  }

  /** @param {string} text */
  _write(text) {
    this.out.write(text)
  }
}

/**
 * Drive a pipeline through one StepRunner: print the summary on success or failure, and exit with
 * the failed step's code.
 *
 * @param {string} title
 * @param {(runner: StepRunner) => Promise<void> | void} body
 */
async function runPipeline(title, body) {
  const runner = new StepRunner({ title })
  try {
    await body(runner)
    runner.printSummary()
  } catch (error) {
    runner.printSummary()
    if (!(error instanceof StepError)) {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`)
    }
    process.exit(error instanceof StepError ? error.code || 1 : 1)
  }
}

module.exports = { StepError, StepRunner, formatDuration, readTail, runPipeline }
