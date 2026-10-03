#!/usr/bin/env node
const { runPipeline } = require('./lib/stepRunner')
const { runVerifySteps } = require('./lib/verify/verifySteps')

runPipeline('verify', (runner) => runVerifySteps(runner))
