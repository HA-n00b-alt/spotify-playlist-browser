#!/usr/bin/env node
/**
 * Write the `pnpm run verify` step list into INSTALL.md from VERIFY_STEPS.
 * With `--check`, write nothing and fail if the committed section is stale.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./lib/env')
const { DOC_FILE, replaceVerifyStepsSection } = require('./lib/verify/verifyStepsDoc')

function main() {
  const check = process.argv.includes('--check')
  const docPath = path.join(ROOT, DOC_FILE)
  const current = fs.readFileSync(docPath, 'utf8')
  const next = replaceVerifyStepsSection(current)

  if (current === next) {
    console.log(`${DOC_FILE} verify steps are up to date`)
    return
  }

  if (check) {
    console.error(
      `${DOC_FILE} verify steps are stale — run \`pnpm run generate:verify-steps-doc\` and commit the result`
    )
    process.exit(1)
  }

  fs.writeFileSync(docPath, next)
  console.log(`${DOC_FILE} verify steps updated`)
}

main()
