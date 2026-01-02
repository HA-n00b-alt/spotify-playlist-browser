import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'
import { query } from '@/lib/db'

export async function GET() {
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

    return NextResponse.json({
      summary: {
        totalUsers,
        totalPageviews,
        totalApiRequests,
        activeUsers7d,
        activeUsers30d,
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
      requestsByStatus: requestsByStatus.map((r) => ({
        statusCode: r.status_code,
        count: parseInt(r.count, 10),
      })),
    })
  } catch (error) {
    console.error('[Analytics] Error fetching stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}



