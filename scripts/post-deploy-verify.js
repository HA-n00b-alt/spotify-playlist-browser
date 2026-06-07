#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { loadEnvLocal } = require('./lib/env')

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://searchmyplaylist.delman.it'

function curlHealth(pathname) {
  const url = `${PRODUCTION_URL}${pathname}`
  const result = spawnSync('curl', ['-fsS', '-m', '30', url], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(`Health check failed for ${url}: ${result.stderr || result.stdout}`)
  }

  return result.stdout.trim()
}

function verifyBpmServiceDirect() {
  const env = loadEnvLocal()
  const serviceUrl = env.BPM_SERVICE_URL
  const sa = JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY)

  const tokenResult = spawnSync(
    'node',
    [
      '-e',
      `const {GoogleAuth}=require('google-auth-library');
       (async()=>{
         const auth=new GoogleAuth({credentials:${JSON.stringify(sa)}});
         const client=await auth.getIdTokenClient(${JSON.stringify(serviceUrl)});
         const token=await client.idTokenProvider.fetchIdToken(${JSON.stringify(serviceUrl)});
         process.stdout.write(token);
       })().catch(e=>{console.error(e);process.exit(1);});`,
    ],
    { encoding: 'utf8' }
  )

  if (tokenResult.status !== 0) {
    throw new Error(`Failed to mint GCP identity token: ${tokenResult.stderr}`)
  }

  const token = tokenResult.stdout.trim()
  const healthUrl = `${serviceUrl}/health`
  const result = spawnSync('curl', ['-fsS', '-m', '30', '-H', `Authorization: Bearer ${token}`, healthUrl], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(`Direct BPM service health failed: ${result.stderr || result.stdout}`)
  }

  return result.stdout.trim()
}

function main() {
  console.log('post-deploy-verify: checking app /api/bpm/health')
  const appHealth = curlHealth('/api/bpm/health')
  if (!appHealth.includes('"ok":true') && !appHealth.includes('"ok": true')) {
    throw new Error(`Unexpected app health response: ${appHealth}`)
  }

  console.log('post-deploy-verify: checking BPM service /health with identity token')
  const bpmHealth = verifyBpmServiceDirect()
  console.log(`post-deploy-verify passed (app=${appHealth}, bpm=${bpmHealth})`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

module.exports = { main }
