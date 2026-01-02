import { neon, neonConfig } from '@neondatabase/serverless'
import { Pool } from 'pg'

// Configure Neon to use fetch (required for Edge runtime)
neonConfig.fetchConnectionCache = true

// Get database URLs from environment
const DATABASE_URL = process.env.DATABASE_URL
const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED || DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Neon serverless client (for Edge runtime / API routes)
export const sql = neon(DATABASE_URL)

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
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime - use Neon serverless
    return (await sql(text, params)) as T[]
  } else {
    // Node runtime - use pooled connection
    const pool = getPool()
    const result = await pool.query(text, params)
    return result.rows as T[]
  }
}

