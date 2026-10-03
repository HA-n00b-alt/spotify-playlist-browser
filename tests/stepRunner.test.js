import { test } from 'vitest'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { StepError, StepRunner, formatDuration } = require('../scripts/lib/stepRunner')
const { VERIFY_STEPS } = require('../scripts/lib/verify/verifySteps')
const {
  DOC_FILE,
  END_MARKER,
  START_MARKER,
  renderVerifySteps,
  replaceVerifyStepsSection,
} = require('../scripts/lib/verify/verifyStepsDoc')

const ROOT = path.resolve(__dirname, '..')

function captureRunner() {
  let text = ''
  const out = { isTTY: false, write: (chunk) => { text += chunk } }
  const runner = new StepRunner({ title: 'test', out, color: false })
  return { runner, output: () => text }
}

function nodeCommand(code) {
  return { command: process.execPath, args: ['-e', code] }
}

test('formatDuration picks ms, seconds or minutes', () => {
  assert.equal(formatDuration(250), '250ms')
  assert.equal(formatDuration(1500), '1.5s')
  assert.equal(formatDuration(125000), '2m05s')
})

test('a passing command prints one PASS line and hides its output', () => {
  const { runner, output } = captureRunner()
  runner.command('ok step', nodeCommand('console.log("noisy output")'))
  assert.match(output(), /^PASS ok step {2}\(\d+ms\)$/m)
  assert.doesNotMatch(output(), /noisy output/)
})

test('a failing command prints FAIL, its output and the exit code, then throws', () => {
  const { runner, output } = captureRunner()
  assert.throws(
    () => runner.command('bad step', nodeCommand('console.error("boom"); process.exit(3)')),
    (error) => error instanceof StepError && error.code === 3 && error.label === 'bad step'
  )
  assert.match(output(), /^FAIL bad step/m)
  assert.match(output(), /exited with status 3/)
  assert.match(output(), /boom/)
  assert.equal(runner.failure.label, 'bad step')
  assert.ok(fs.existsSync(runner.failure.logPath), 'the failed step keeps its log')
})

test('a pipeline stops at the first failure and the summary names it', () => {
  const { runner, output } = captureRunner()
  const ran = []
  assert.throws(() => {
    for (const [label, code] of [['one', 0], ['two', 1], ['three', 0]]) {
      ran.push(label)
      runner.command(label, nodeCommand(`process.exit(${code})`))
    }
  }, StepError)
  runner.printSummary()
  assert.deepEqual(ran, ['one', 'two'])
  assert.match(output(), /test: 1 passed, 1 failed/)
  assert.match(output(), /Failed at: two/)
})

test('a function step that throws is reported as FAIL with the error', async () => {
  const { runner, output } = captureRunner()
  await assert.rejects(
    runner.step('fn step', () => {
      throw new Error('kaput')
    }),
    StepError
  )
  assert.match(output(), /^FAIL fn step/m)
  assert.match(output(), /kaput/)
})

test('skipped steps are counted in the summary', () => {
  const { runner } = captureRunner()
  runner.skip('extras', 'nothing to do')
  assert.match(runner.summary(), /0 passed, 1 skipped/)
})

test('every verify step points at an existing npm script', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const labels = new Set()
  for (const step of VERIFY_STEPS) {
    assert.ok(scripts[step.script], `package.json has no "${step.script}" script`)
    assert.ok(step.why.trim(), `"${step.label}" needs a why`)
    assert.ok(!labels.has(step.label), `duplicate label "${step.label}"`)
    labels.add(step.label)
  }
})

test('the verify steps doc section is regenerated between its markers', () => {
  const stale = `intro\n${START_MARKER}\n1. old\n${END_MARKER}\noutro\n`
  const fresh = replaceVerifyStepsSection(stale)
  assert.equal(fresh, `intro\n${renderVerifySteps()}\noutro\n`)
  assert.equal(replaceVerifyStepsSection(fresh), fresh)
  assert.throws(() => replaceVerifyStepsSection('no markers'), /missing the verify-steps markers/)
})

test(`${DOC_FILE} lists the current verify steps`, () => {
  const doc = fs.readFileSync(path.join(ROOT, DOC_FILE), 'utf8')
  assert.equal(replaceVerifyStepsSection(doc), doc)
})
