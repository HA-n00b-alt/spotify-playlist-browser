import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'
import { getMusoUsageSnapshot } from '@/lib/muso'
import { logError, withApiLogging } from '@/lib/logger'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const GET = withApiLogging(async () => {
  // Check if user is admin
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    )
  }

  try {
    // Get total unique users
    const totalUsersResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analytics_users`
    )
    const totalUsers = parseInt(totalUsersResult[0]?.count || '0', 10)

    // Get total pageviews
    const totalPageviewsResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analytics_pageviews`
    )
    const totalPageviews = parseInt(totalPageviewsResult[0]?.count || '0', 10)

    // Get total API requests
    const totalApiRequestsResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM analytics_api_requests`
    )
    const totalApiRequests = parseInt(totalApiRequestsResult[0]?.count || '0', 10)

    const externalProviders = ['spotify', 'muso', 'musicbrainz']
    const externalUsageRows = await query<{ provider: string; count: string }>(
      `SELECT provider, SUM(request_count) as count
       FROM external_api_usage
       WHERE provider = ANY($1::text[])
       GROUP BY provider`,
      [externalProviders]
    )
    const externalUsageTotals = externalProviders.reduce<Record<string, number>>((acc, provider) => {
      acc[provider] = 0
      return acc
    }, {})
    externalUsageRows.forEach((row) => {
      externalUsageTotals[row.provider] = parseInt(row.count, 10)
    })

    // Get pageviews by path (top 10)
    const topPaths = await query<{ path: string; count: string }>(
      `SELECT path, COUNT(*) as count 
       FROM analytics_pageviews 
       GROUP BY path 
       ORDER BY count DESC 
       LIMIT 10`
    )

    // Get API requests by endpoint (top 10)
    const topEndpoints = await query<{ endpoint: string; method: string; count: string }>(
      `SELECT endpoint, method, COUNT(*) as count 
       FROM analytics_api_requests 
       GROUP BY endpoint, method 
       ORDER BY count DESC 
       LIMIT 10`
    )

    // Get pageviews over time (last 30 days, grouped by day)
    const pageviewsOverTime = await query<{ date: string; count: string }>(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM analytics_pageviews 
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) 
       ORDER BY date ASC`
    )

    // Get API requests over time (last 30 days, grouped by day)
    const apiRequestsOverTime = await query<{ date: string; count: string }>(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM analytics_api_requests 
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) 
       ORDER BY date ASC`
    )

    const apiRequestsOverTimeByProviderResult = await query<{ provider: string; date: string; count: string }>(
      `SELECT provider, usage_date as date, SUM(request_count) as count
       FROM external_api_usage
       WHERE usage_date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY provider, usage_date
       ORDER BY date ASC`
    )

    // Get active users (last 7 days)
    const activeUsers7dResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT spotify_user_id) as count 
       FROM analytics_pageviews 
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    )
    const activeUsers7d = parseInt(activeUsers7dResult[0]?.count || '0', 10)

    // Get active users (last 30 days)
    const activeUsers30dResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT spotify_user_id) as count 
       FROM analytics_pageviews 
       WHERE created_at >= NOW() - INTERVAL '30 days'`
    )
    const activeUsers30d = parseInt(activeUsers30dResult[0]?.count || '0', 10)

    // Get API requests by status code
    const requestsByStatus = await query<{ status_code: number | null; count: string }>(
      `SELECT status_code, COUNT(*) as count 
       FROM analytics_api_requests 
       GROUP BY status_code 
       ORDER BY count DESC`
    )

    const apiRequestsOverTimeByProvider = apiRequestsOverTimeByProviderResult.reduce(
      (acc, row) => {
        const provider = row.provider as 'spotify' | 'musicbrainz' | 'muso'
        if (!acc[provider]) {
          acc[provider] = []
        }
        acc[provider].push({
          date: row.date,
          count: parseInt(row.count, 10),
        })
        return acc
      },
      { spotify: [], musicbrainz: [], muso: [] } as Record<'spotify' | 'musicbrainz' | 'muso', { date: string; count: number }[]>
    )

    const musoUsage = await getMusoUsageSnapshot()

    return NextResponse.json({
      summary: {
        totalUsers,
        totalPageviews,
        totalApiRequests,
        activeUsers7d,
        activeUsers30d,
        spotifyApiRequests: externalUsageTotals.spotify,
        musoApiRequests: externalUsageTotals.muso,
        musicbrainzApiRequests: externalUsageTotals.musicbrainz,
        musoDailyUsed: musoUsage.used,
        musoDailyLimit: musoUsage.limit,
        musoDailyRemaining: musoUsage.remaining,
      },
      topPaths: topPaths.map((p) => ({
        path: p.path,
        count: parseInt(p.count, 10),
      })),
      topEndpoints: topEndpoints.map((e) => ({
        endpoint: e.endpoint,
        method: e.method,
        count: parseInt(e.count, 10),
      })),
      pageviewsOverTime: pageviewsOverTime.map((p) => ({
        date: p.date,
        count: parseInt(p.count, 10),
      })),
      apiRequestsOverTime: apiRequestsOverTime.map((a) => ({
        date: a.date,
        count: parseInt(a.count, 10),
      })),
      apiRequestsOverTimeByProvider,
      requestsByStatus: requestsByStatus.map((r) => ({
        statusCode: r.status_code,
        count: parseInt(r.count, 10),
      })),
    })
  } catch (error) {
    logError(error, { component: 'analytics.stats' })
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
})
