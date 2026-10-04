#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { loadEnvLocal } = require('./lib/env')

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://searchmyplaylist.delman.it'

// A fixed iTunes track (Daft Punk, "Get Lucky") whose 30s preview is sent through the whole BPM
// pipeline: bpm-service -> Pub/Sub -> bpm-worker -> Firestore -> stream. /health on bpm-service
// stays green when the queue or the worker is broken (#56), so only a real song proves BPM works.
const E2E_ITUNES_TRACK_ID = '617154366'
// A warm worker answers in ~2s and a cold one in ~15s.
const E2E_TIMEOUT_MS = 60_000

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

function mintBpmServiceToken(env) {
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

  return tokenResult.stdout.trim()
}

function verifyBpmServiceDirect(env, token) {
  const serviceUrl = env.BPM_SERVICE_URL
  const healthUrl = `${serviceUrl}/health`
  const result = spawnSync('curl', ['-fsS', '-m', '30', '-H', `Authorization: Bearer ${token}`, healthUrl], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(`Direct BPM service health failed: ${result.stderr || result.stdout}`)
  }

  return result.stdout.trim()
}

async function fetchE2ePreviewUrl() {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${E2E_ITUNES_TRACK_ID}`)
  if (!response.ok) {
    throw new Error(`iTunes lookup for the BPM test song failed: ${response.status}`)
  }
  const previewUrl = (await response.json()).results?.[0]?.previewUrl
  if (!previewUrl) {
    throw new Error(`iTunes track ${E2E_ITUNES_TRACK_ID} has no preview; pick another test song`)
  }
  return previewUrl
}

// Reads an NDJSON stream and resolves with the first line that is a final track result.
async function readFinalResult(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastStatus = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      const data = JSON.parse(line)
      if (typeof data.index === 'number' && data.status === 'final') {
        await reader.cancel()
        return data
      }
      if (data.type === 'error') {
        throw new Error(`BPM stream reported an error: ${data.message}`)
      }
      if (data.type === 'status') lastStatus = data
    }
  }
  throw new Error(`BPM stream ended without a final result (last status: ${JSON.stringify(lastStatus)})`)
}

async function verifyBpmAnalysisEndToEnd(env, token) {
  const serviceUrl = env.BPM_SERVICE_URL
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const previewUrl = await fetchE2ePreviewUrl()
  const startedAt = Date.now()
  const signal = AbortSignal.timeout(E2E_TIMEOUT_MS)

  try {
    const batchResponse = await fetch(`${serviceUrl}/analyze/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ urls: [previewUrl], max_confidence: 0.65 }),
      signal,
    })
    if (!batchResponse.ok) {
      throw new Error(`BPM batch request failed: ${batchResponse.status} ${await batchResponse.text()}`)
    }
    const { batch_id: batchId } = await batchResponse.json()
    const streamResponse = await fetch(`${serviceUrl}/stream/${batchId}`, { headers, signal })
    if (!streamResponse.ok || !streamResponse.body) {
      throw new Error(`BPM stream request failed: ${streamResponse.status}`)
    }
    const result = await readFinalResult(streamResponse.body)
    const bpm = result.bpm_essentia ?? result.bpm_librosa
    if (bpm == null) {
      throw new Error(`BPM test song finished without a BPM: ${JSON.stringify(result).slice(0, 300)}`)
    }
    return `${bpm} BPM in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `BPM test song got no result within ${E2E_TIMEOUT_MS / 1000}s: songs are accepted but not ` +
          'analysed. Check the bpm-analysis-worker-sub Pub/Sub subscription and the bpm-worker logs.'
      )
    }
    throw error
  }
}

async function main() {
  console.log('post-deploy-verify: checking app /api/bpm/health')
  const appHealth = curlHealth('/api/bpm/health')
  if (!appHealth.includes('"ok":true') && !appHealth.includes('"ok": true')) {
    throw new Error(`Unexpected app health response: ${appHealth}`)
  }

  const env = loadEnvLocal()
  const token = mintBpmServiceToken(env)

  console.log('post-deploy-verify: checking BPM service /health with identity token')
  const bpmHealth = verifyBpmServiceDirect(env, token)

  console.log('post-deploy-verify: analysing one test song through the BPM service')
  const e2e = await verifyBpmAnalysisEndToEnd(env, token)
  console.log(`post-deploy-verify passed (app=${appHealth}, bpm=${bpmHealth}, song=${e2e})`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

module.exports = { main }
