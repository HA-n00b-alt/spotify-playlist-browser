import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    // Test database connection and check if table exists
    const tableCheck = await query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_name = 'track_bpm_cache'`
    )
    
    const allTables = await query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       ORDER BY table_name`
    )
    
    let tableInfo = null
    if (tableCheck.length > 0) {
      // Table exists, get some info
      const count = await query(`SELECT COUNT(*) as count FROM track_bpm_cache`)
      const sample = await query(`SELECT * FROM track_bpm_cache LIMIT 5`)
      tableInfo = {
        exists: true,
        count: count[0]?.count || 0,
        sample: sample,
      }
    }
    
    return NextResponse.json({
      connected: true,
      track_bpm_cache_exists: tableCheck.length > 0,
      all_tables: allTables.map((t: any) => t.table_name),
      track_bpm_cache_info: tableInfo,
      env_check: {
        has_database_url: !!process.env.DATABASE_URL,
        has_database_url_unpooled: !!process.env.DATABASE_URL_UNPOOLED,
        database_url_preview: process.env.DATABASE_URL 
          ? process.env.DATABASE_URL.substring(0, 30) + '...' 
          : 'not set',
      },
    })
  } catch (error) {
    console.error('[DB Debug] Error:', error)
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        env_check: {
          has_database_url: !!process.env.DATABASE_URL,
          has_database_url_unpooled: !!process.env.DATABASE_URL_UNPOOLED,
        },
      },
      { status: 500 }
    )
  }
}

