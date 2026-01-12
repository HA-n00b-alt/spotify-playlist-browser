import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'

type VerificationPayload = {
  artist?: string
  title?: string
  isrc?: string
  year?: string
  bpm?: string
  key?: string
  scale?: string
}

function buildPrompt(payload: VerificationPayload) {
  const parts = [
    payload.artist ? `Artist: ${payload.artist}` : null,
    payload.title ? `Title: ${payload.title}` : null,
    payload.isrc ? `ISRC: ${payload.isrc}` : null,
    payload.year ? `Year: ${payload.year}` : null,
    payload.bpm ? `Detected BPM: ${payload.bpm}` : null,
    payload.key ? `Detected Key: ${payload.key}` : null,
    payload.scale ? `Detected Scale: ${payload.scale}` : null,
  ].filter(Boolean)

  return `
You are helping a music catalog admin verify BPM and key accuracy.
Use web search to find authoritative sources for the track's BPM and musical key.
Compare the detected BPM/key with sources and highlight any mismatches.
Respond with:
1) Summary of findings
2) Sources referenced (URLs if available)
3) Recommendation for manual override

Track details:
${parts.join('\n')}
`.trim()
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string') {
    return payload.output_text
  }
  if (!Array.isArray(payload?.output)) {
    return ''
  }
  const chunks: string[] = []
  for (const item of payload.output) {
    if (item?.type !== 'message' || !Array.isArray(item?.content)) continue
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        chunks.push(content.text)
      }
    }
  }
  return chunks.join('\n')
}

export async function POST(request: Request) {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
  }

  const payload = (await request.json().catch(() => ({}))) as VerificationPayload
  if (!payload.artist && !payload.title && !payload.isrc) {
    return NextResponse.json(
      { error: 'Provide at least an artist, title, or ISRC to verify.' },
      { status: 400 }
    )
  }
  const prompt = buildPrompt(payload)

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: prompt,
      tools: [{ type: 'web_search' }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    return NextResponse.json({ error: errorText || 'OpenAI request failed' }, { status: 500 })
  }

  const data = await response.json().catch(() => null)
  const result = extractOutputText(data)

  return NextResponse.json({ result })
}
