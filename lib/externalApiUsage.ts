import { query } from './db'
import { logError } from './logger'

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function incrementExternalApiUsage(provider: string): Promise<void> {
  try {
    const today = getTodayDate()
    await query(
      `INSERT INTO external_api_usage (provider, usage_date, request_count, updated_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (provider, usage_date)
       DO UPDATE SET request_count = external_api_usage.request_count + 1, updated_at = NOW()`,
      [provider, today]
    )
  } catch (error) {
    logError(error, { component: 'externalApiUsage.increment', provider })
  }
}
