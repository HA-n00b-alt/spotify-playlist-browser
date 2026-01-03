import { neon } from '@neondatabase/serverless'
import { Pool } from 'pg'

// Get database URLs from environment
const DATABASE_URL = process.env.DATABASE_URL
const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED || DATABASE_URL

// Neon serverless client (for Edge runtime / API routes)
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null as any

// Pooled connection for migrations and CLI (uses direct connection)
export function getPool() {
  if (!DATABASE_URL_UNPOOLED) {
    throw new Error('DATABASE_URL_UNPOOLED environment variable is not set')
  }
  
  return new Pool({
    connectionString: DATABASE_URL_UNPOOLED,
    ssl: {
      rejectUnauthorized: false, // Neon uses SSL
    },
  })
}

// Helper to execute queries (works in both Edge and Node runtime)
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  if (!DATABASE_URL) {
    const error = new Error('DATABASE_URL environment variable is not set')
    console.error('[DB]', error.message)
    throw error
  }
  
  try {
    // Use Neon serverless for API routes (works in both Edge and Node runtime)
    console.log(`[DB] Executing query: ${text.substring(0, 100)}...`, params ? `with ${params.length} params` : '')
    const sqlClient = neon(DATABASE_URL)
    const result = await sqlClient(text, params || [])
    console.log(`[DB] Query result: ${Array.isArray(result) ? result.length : 'non-array'} rows`)
    return result as T[]
  } catch (error) {
    console.error(`[DB] Query error:`, error)
    if (error instanceof Error) {
      console.error(`[DB] Error message:`, error.message)
      console.error(`[DB] Error stack:`, error.stack)
    }
    throw error
  }
}
