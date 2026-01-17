'use client'

import { useEffect, useState } from 'react'

interface StatsData {
  summary: {
    totalUsers: number
    totalPageviews: number
    totalApiRequests: number
    activeUsers7d: number
    activeUsers30d: number
    spotifyApiRequests: number
    musoApiRequests: number
    musicbrainzApiRequests: number
    musoDailyUsed: number
    musoDailyLimit: number
    musoDailyRemaining: number
  }
  topPaths: Array<{ path: string; count: number }>
  topEndpoints: Array<{ endpoint: string; method: string; count: number }>
  pageviewsOverTime: Array<{ date: string; count: number }>
  apiRequestsOverTime: Array<{ date: string; count: number }>
  requestsByStatus: Array<{ statusCode: number | null; count: number }>
}

export default function StatsClient() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics/stats')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch stats')
        }
        return res.json()
      })
      .then((data) => {
        setStats(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading stats...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">Error: {error}</div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats.summary.totalUsers.toLocaleString()}
          description="Unique users"
        />
        <StatCard
          title="Total Pageviews"
          value={stats.summary.totalPageviews.toLocaleString()}
          description="All time"
        />
        <StatCard
          title="Active Users (7d)"
          value={stats.summary.activeUsers7d.toLocaleString()}
          description="Last 7 days"
        />
        <StatCard
          title="Active Users (30d)"
          value={stats.summary.activeUsers30d.toLocaleString()}
          description="Last 30 days"
        />
        <StatCard
          title="Spotify API Calls"
          value={stats.summary.spotifyApiRequests.toLocaleString()}
          description="All time"
        />
        <StatCard
          title="MusicBrainz API Calls"
          value={stats.summary.musicbrainzApiRequests.toLocaleString()}
          description="All time"
        />
        <StatCard
          title="Muso API Calls"
          value={stats.summary.musoApiRequests.toLocaleString()}
          description="All time"
        />
        <StatCard
          title="Muso API Used (Today)"
          value={stats.summary.musoDailyUsed.toLocaleString()}
          description={`Remaining ${stats.summary.musoDailyRemaining.toLocaleString()} of ${stats.summary.musoDailyLimit.toLocaleString()}`}
        />
      </div>

      {/* Top Paths and Endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Top Pages</h2>
          <div className="space-y-2">
            {stats.topPaths.length > 0 ? (
              stats.topPaths.map((item, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700 font-mono">{item.path}</span>
                  <span className="text-sm font-semibold text-gray-900">{item.count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No data available</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Top API Endpoints</h2>
          <div className="space-y-2">
            {stats.topEndpoints.length > 0 ? (
              stats.topEndpoints.map((item, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{item.method}</span>
                    <span className="text-sm text-gray-700 font-mono">{item.endpoint}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{item.count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Requests by Status Code */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">API Requests by Status Code</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {stats.requestsByStatus.map((item, index) => (
            <div key={index} className="text-center p-3 bg-gray-50 rounded">
              <div className="text-2xl font-bold text-gray-900">{item.count.toLocaleString()}</div>
              <div className="text-sm text-gray-600 mt-1">
                {item.statusCode !== null ? item.statusCode : 'N/A'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time Series Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Pageviews Over Time (Last 30 Days)</h2>
          {stats.pageviewsOverTime.length > 0 ? (
            <div className="space-y-1">
              {stats.pageviewsOverTime.map((item, index) => {
                // Handle date string - could be "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS..."
                const dateStr = typeof item.date === 'string' ? item.date.split('T')[0] : item.date
                const date = new Date(dateStr + 'T00:00:00') // Add time to avoid timezone issues
                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                return (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">{formattedDate}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                    <div
                      className="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2"
                      style={{
                        width: `${
                          (item.count / Math.max(...stats.pageviewsOverTime.map((p) => p.count))) * 100
                        }%`,
                      }}
                    >
                      <span className="text-xs text-white font-semibold">{item.count}</span>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No data available</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">API Requests Over Time (Last 30 Days)</h2>
          {stats.apiRequestsOverTime.length > 0 ? (
            <div className="space-y-1">
              {stats.apiRequestsOverTime.map((item, index) => {
                // Handle date string - could be "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS..."
                const dateStr = typeof item.date === 'string' ? item.date.split('T')[0] : item.date
                const date = new Date(dateStr + 'T00:00:00') // Add time to avoid timezone issues
                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                return (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">{formattedDate}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                    <div
                      className="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2"
                      style={{
                        width: `${
                          (item.count / Math.max(...stats.apiRequestsOverTime.map((a) => a.count))) * 100
                        }%`,
                      }}
                    >
                      <span className="text-xs text-white font-semibold">{item.count}</span>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No data available</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-xs text-gray-400">{description}</div>
    </div>
  )
}
