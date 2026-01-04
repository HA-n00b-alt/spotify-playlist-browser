import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/analytics'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { playlistIds } = body

    if (!Array.isArray(playlistIds)) {
      return NextResponse.json(
        { error: 'playlistIds must be an array' },
        { status: 400 }
      )
    }

    // Delete existing order for this user
    await query(
      `DELETE FROM playlist_order WHERE spotify_user_id = $1`,
      [userId]
    )

    // Insert new order
    if (playlistIds.length > 0) {
      // Use a simpler approach: insert one by one or use a transaction
      // For better performance with many playlists, we'll use a single query with multiple VALUES
      const values: string[] = []
      const params: (string | number)[] = [userId]
      let paramIndex = 2
      
      playlistIds.forEach((playlistId: string, index: number) => {
        values.push(`($1, $${paramIndex}, $${paramIndex + 1})`)
        params.push(playlistId, index)
        paramIndex += 2
      })
      
      const queryText = `
        INSERT INTO playlist_order (spotify_user_id, playlist_id, display_order)
        VALUES ${values.join(', ')}
        ON CONFLICT (spotify_user_id, playlist_id) 
        DO UPDATE SET display_order = EXCLUDED.display_order, updated_at = NOW()
      `
      
      await query(queryText, params)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving playlist order:', error)
    return NextResponse.json(
      { error: 'Failed to save playlist order' },
      { status: 500 }
    )
  }
}

