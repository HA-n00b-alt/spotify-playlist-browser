import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const POST = withApiLogging(async (request: Request) => {
  const userId = await getCurrentUserId()
  
  try {
    const body = await request.json()
    const { spotifyTrackId, bpmSelected, keySelected, bpmManual, keyManual, scaleManual } = body

    if (!spotifyTrackId) {
      return NextResponse.json(
        { error: 'spotifyTrackId is required' },
        { status: 400 }
      )
    }

    // Validate selections
    if (bpmSelected && !['essentia', 'librosa', 'manual'].includes(bpmSelected)) {
      return NextResponse.json(
        { error: 'bpmSelected must be essentia, librosa, or manual' },
        { status: 400 }
      )
    }

    if (keySelected && !['essentia', 'librosa', 'manual'].includes(keySelected)) {
      return NextResponse.json(
        { error: 'keySelected must be essentia, librosa, or manual' },
        { status: 400 }
      )
    }

    // If manual is selected, require manual values
    if (bpmSelected === 'manual' && bpmManual == null) {
      return NextResponse.json(
        { error: 'bpmManual is required when bpmSelected is manual' },
        { status: 400 }
      )
    }

    if (keySelected === 'manual' && (!keyManual || !scaleManual)) {
      return NextResponse.json(
        { error: 'keyManual and scaleManual are required when keySelected is manual' },
        { status: 400 }
      )
    }

    logInfo('Updating BPM selection', {
      component: 'api.bpm.update-selection',
      userId: userId || 'anonymous',
      spotifyTrackId,
      bpmSelected,
      keySelected,
    })

    // Update the database
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (bpmSelected !== undefined) {
      updates.push(`bpm_selected = $${paramIndex++}`)
      values.push(bpmSelected)
    }

    if (keySelected !== undefined) {
      updates.push(`key_selected = $${paramIndex++}`)
      values.push(keySelected)
    }

    if (bpmManual !== undefined) {
      updates.push(`bpm_manual = $${paramIndex++}`)
      values.push(bpmManual)
    }

    if (keyManual !== undefined) {
      updates.push(`key_manual = $${paramIndex++}`)
      values.push(keyManual)
    }

    if (scaleManual !== undefined) {
      updates.push(`scale_manual = $${paramIndex++}`)
      values.push(scaleManual)
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      )
    }

    updates.push(`updated_at = NOW()`)
    values.push(spotifyTrackId)

    const updateQuery = `
      UPDATE track_bpm_cache 
      SET ${updates.join(', ')}
      WHERE spotify_track_id = $${paramIndex}
    `

    await query(updateQuery, values)

    return NextResponse.json({ success: true })
  } catch (error) {
    logError(error, {
      component: 'api.bpm.update-selection',
      userId: userId || 'anonymous',
      status: 500,
    })
    const errorMessage = error instanceof Error ? error.message : 'Failed to update selection'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
})
