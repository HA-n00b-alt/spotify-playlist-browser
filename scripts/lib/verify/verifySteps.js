/**
 * The `pnpm run verify` pipeline, in one place (#6).
 *
 * The list is authored once, here. Everything else is derived from it:
 *
 * - `scripts/verify.js` runs each `{ label, script }` through the step runner.
 * - `scripts/deploy-production.js` runs the same list as its first step.
 * - The step list in `INSTALL.md` is written by `pnpm run generate:verify-steps-doc`, and the
 *   `verify steps doc` step fails when that section is stale.
 *
 * `script` is an npm script name; the command itself stays in `package.json`. `why` is one
 * markdown paragraph: what the step fails on, and why the check exists.
 *
 * ORDER IS THE PIPELINE ORDER. Cheap, dependency-free checks first; `typecheck`, `lint` and
 * `test` last, so a typo fails in seconds.
 */

/**
 * @typedef {object} VerifyStep
 * @property {string} label shown by the step runner
 * @property {string} script the npm script to run
 * @property {string} why one markdown paragraph explaining the step
 */

/** @type {ReadonlyArray<VerifyStep>} */
const VERIFY_STEPS = Object.freeze([
  {
    label: 'env contract',
    script: 'check:env-contract',
    why:
      'fails when a required variable is missing from `.env.example` or empty in `.env.local`, ' +
      'or when the BPM service URL or Google Cloud service account is not the expected ' +
      '`delman-site` one, so a deploy never ships with a half-configured BPM integration.',
  },
  {
    label: 'api routes',
    script: 'check:api-routes',
    why:
      'fails when a `route.ts` under `app/api/` exports no HTTP method handler, so a refactor ' +
      'cannot silently turn an endpoint into a 405.',
  },
  {
    label: 'runtime console',
    script: 'check:runtime-console',
    why:
      'fails on `console.*` calls in `app/api`, `app/actions` and `lib` outside `lib/logger.ts`; ' +
      'server logs go through the structured logger so they stay searchable in production.',
  },
  {
    label: 'csp cloudflare jsd filter',
    script: 'check:csp-cloudflare-jsd-filter',
    why:
      'placeholder for the Cloudflare JSD CSP filter: passes while there is no `wrangler.toml`, ' +
      'and fails as soon as one exists until the Cloudflare migration defines the real check.',
  },
  {
    label: 'verify steps doc',
    script: 'check:verify-steps-doc',
    why:
      'fails when the step list in `INSTALL.md` no longer matches this list. Fix it with ' +
      '`pnpm run generate:verify-steps-doc`.',
  },
  {
    label: 'typecheck',
    script: 'typecheck',
    why: 'runs `tsc --noEmit` over the whole project.',
  },
  {
    label: 'lint',
    script: 'check:strict',
    why: 'runs `next lint` with the `next/core-web-vitals` rules.',
  },
  {
    label: 'test',
    script: 'test',
    why: 'runs the `node --test` suite under `tests/`.',
  },
])

/**
 * Run every verify step on `runner`, stopping at the first failure.
 *
 * @param {import('../stepRunner').StepRunner} runner
 */
function runVerifySteps(runner) {
  for (const { label, script } of VERIFY_STEPS) {
    // `npm run`, not `pnpm run`: pnpm 11 re-checks the install before every run and fails the
    // step on unapproved build scripts (#22). npm runs the same package.json script directly.
    runner.command(label, { command: 'npm', args: ['run', script] })
  }
}

module.exports = { VERIFY_STEPS, runVerifySteps }
