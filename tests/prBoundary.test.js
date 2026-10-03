import { test } from 'vitest'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  EXPECTED_HOOKS,
  HOOKS_DIR,
  classifyPrLookup,
  fillPrTemplate,
  hookInstallProblems,
  issueNumberFromBranch,
  parsePrePushRefs,
  pushedBranchNames,
} = require('../scripts/lib/git/prBoundary')

const ROOT = path.resolve(__dirname, '..')
const SHA = 'a'.repeat(40)
const ZERO = '0'.repeat(40)

test('pushedBranchNames keeps pushed branches and drops deletes, tags and duplicates', () => {
  const refs = parsePrePushRefs(
    [
      `refs/heads/0007-x ${SHA} refs/heads/0007-x ${ZERO}`,
      `refs/heads/0007-x ${SHA} refs/heads/0007-x ${SHA}`,
      `(delete) ${ZERO} refs/heads/old ${SHA}`,
      `refs/tags/v1 ${SHA} refs/tags/v1 ${ZERO}`,
      '',
    ].join('\n')
  )
  assert.equal(refs.length, 4)
  assert.deepEqual(pushedBranchNames(refs), ['0007-x'])
})

test('parsePrePushRefs returns nothing for empty stdin', () => {
  assert.deepEqual(parsePrePushRefs(''), [])
})

test('classifyPrLookup separates open, none and unknown', () => {
  assert.equal(classifyPrLookup({ available: true, code: 0, stdout: '[{"number":1}]' }).state, 'open')
  assert.equal(classifyPrLookup({ available: true, code: 0, stdout: '[]' }).state, 'none')
  assert.deepEqual(classifyPrLookup({ available: false }), { state: 'unknown', reason: 'the `gh` CLI is not on PATH' })
  assert.deepEqual(classifyPrLookup({ available: true, code: 1, stderr: '\nnot logged in\nmore' }), {
    state: 'unknown',
    reason: 'not logged in',
  })
  assert.equal(classifyPrLookup({ available: true, code: 0, stdout: 'nope' }).state, 'unknown')
  assert.equal(classifyPrLookup({ available: true, code: 0, stdout: '{}' }).state, 'unknown')
})

test('hookInstallProblems reports hooksPath and each missing or non-executable hook', () => {
  const healthy = EXPECTED_HOOKS.map(({ name }) => ({ name, exists: true, executable: true }))
  assert.deepEqual(hookInstallProblems({ hooksPath: HOOKS_DIR, hooks: healthy }), [])

  const problems = hookInstallProblems({
    hooksPath: null,
    hooks: [
      { name: 'pre-commit', exists: false, executable: false },
      { name: 'pre-push', exists: true, executable: false },
    ],
  })
  assert.equal(problems.length, 3)
  assert.match(problems[0], /core\.hooksPath is not set/)
  assert.match(problems[1], /pre-commit is missing/)
  assert.match(problems[2], /pre-push is not executable/)
  assert.match(hookInstallProblems({ hooksPath: '.husky', hooks: healthy })[0], /`\.husky`, expected/)
})

test('every expected hook is committed and executable', () => {
  for (const { name } of EXPECTED_HOOKS) {
    const file = path.join(ROOT, HOOKS_DIR, name)
    assert.ok(fs.existsSync(file), `${file} exists`)
    assert.ok(fs.statSync(file).mode & 0o111, `${file} is executable`)
  }
})

test('issueNumberFromBranch reads the zero-padded prefix', () => {
  assert.equal(issueNumberFromBranch('0007-claude-git-hooks'), 7)
  assert.equal(issueNumberFromBranch('0123-codex-x'), 123)
  assert.equal(issueNumberFromBranch('0000-claude-chore'), null)
  assert.equal(issueNumberFromBranch('claude/feature'), null)
})

test('fillPrTemplate points the committed template at the issue', () => {
  const template = fs.readFileSync(path.join(ROOT, '.github', 'pull_request_template.md'), 'utf8')
  const filled = fillPrTemplate(template, 7)
  assert.match(filled, /^Closes #7$/m)
  assert.equal(fillPrTemplate(template, null), template)
})
