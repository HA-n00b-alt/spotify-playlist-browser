'use server'

import { getIdentityToken } from '@/lib/bpm'

const BPM_SERVICE_URL = process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'

/**
 * Server Action to submit audio URL for BPM analysis
 * Calls the BPM service's /analyze/batch endpoint and returns the batch_id
 */
export async function processAudioUrl(formData: FormData): Promise<{ batchId: string; totalUrls: number }> {
  const audioUrl = formData.get('audioUrl') as string

  if (!audioUrl || typeof audioUrl !== 'string') {
    throw new Error('audioUrl is required and must be a string')
  }

  // Validate URL format
  try {
    const url = new URL(audioUrl)
    if (url.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed')
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Invalid URL format')
    }
    throw error
  }

  // Get identity token for Cloud Run authentication
  const idToken = await getIdentityToken(BPM_SERVICE_URL)

  // Call the BPM service's /analyze/batch endpoint
  const response = await fetch(`${BPM_SERVICE_URL}/analyze/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      urls: [audioUrl],
      max_confidence: 0.65,
      debug_level: 'minimal',
      fallback_override: 'never',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`BPM service error: ${response.status} ${errorText}`)
  }

  const data = await response.json()

  if (!data.batch_id) {
    throw new Error('Invalid response from BPM service: missing batch_id')
  }

  return {
    batchId: data.batch_id,
    totalUrls: data.total_urls || 1,
  }
}
