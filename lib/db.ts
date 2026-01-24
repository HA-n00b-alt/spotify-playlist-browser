import { neon } from '@neondatabase/serverless'
import { Pool } from 'pg'
import { logError, logInfo, logWarning } from './logger'

// Get database URLs from environment
const DATABASE_URL = process.env.DATABASE_URL
const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED || DATABASE_URL

// Neon serverless client (for Edge runtime / API routes)
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null as any

// Pooled connection for migrations and CLI (uses direct connection)
export function getPool() {
  if (!DATABASE_URL_UNPOOLED) {
    const error = new Error('DATABASE_URL_UNPOOLED environment variable is not set')
    logError(error, {
      component: 'db.getPool',
      env: {
        hasDatabaseUrl: !!DATABASE_URL,
        hasDatabaseUrlUnpooled: !!DATABASE_URL_UNPOOLED,
      },
    })
    throw error
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
    logError(error, {
      component: 'db.query',
      env: {
        hasDatabaseUrl: !!DATABASE_URL,
        hasDatabaseUrlUnpooled: !!DATABASE_URL_UNPOOLED,
      },
    })
    throw error
  }
  
  const queryPreview = text.substring(0, 100)
  const paramsCount = params?.length || 0
  
  const start = Date.now()
  const slowThresholdMs = Number.parseInt(process.env.DB_SLOW_QUERY_MS || '500', 10)
  try {
    logInfo('Executing database query', {
      component: 'db.query',
      queryPreview,
      paramsCount,
      hasParams: paramsCount > 0,
    })
    
    if (!sql) {
      throw new Error('Database client is not initialized')
    }
    // Use shared Neon serverless client for API routes.
    const result = await sql(text, params || [])
    
    const durationMs = Date.now() - start
    const resultCount = Array.isArray(result) ? result.length : 'non-array'
    const logPayload = {
      component: 'db.query',
      queryPreview,
      resultCount,
      durationMs,
    }
    if (durationMs >= slowThresholdMs) {
      logWarning('Slow database query detected', {
        ...logPayload,
        slowThresholdMs,
      })
    } else {
      logInfo('Database query completed', logPayload)
    }
    
    return result as T[]
  } catch (error) {
    const durationMs = Date.now() - start
    logError(error, {
      component: 'db.query',
      queryPreview,
      paramsCount,
      durationMs,
      query: text,
      params: params && params.length > 0 ? params : undefined,
    })
    throw error
  }
}
