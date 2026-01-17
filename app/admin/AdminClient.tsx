'use client'

import { useEffect, useState } from 'react'

interface AdminEntry {
  spotify_user_id: string
  active: boolean
  created_at: string
  is_super_admin?: boolean
  display_name?: string | null
  email?: string | null
}

interface AdminRequest {
  id: number
  spotify_user_id: string
  display_name?: string | null
  email?: string | null
  requested_at: string
}

export default function AdminClient() {
  const [admins, setAdmins] = useState<AdminEntry[]>([])
  const [requests, setRequests] = useState<AdminRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [newAdmin, setNewAdmin] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingEmail, setEditingEmail] = useState('')

  const loadAdmins = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        throw new Error('Failed to load admin users')
      }
      const data = await res.json()
      setAdmins(Array.isArray(data?.admins) ? data.admins : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin users')
    } finally {
      setLoading(false)
    }
  }

  const loadRequests = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/requests')
      if (!res.ok) {
        throw new Error('Failed to load admin requests')
      }
      const data = await res.json()
      setRequests(Array.isArray(data?.requests) ? data.requests : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdmins()
    loadRequests()
  }, [])

  const handleAdd = async () => {
    const userId = newAdmin.trim()
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotifyUserId: userId,
          displayName: newAdminName.trim() || null,
          email: newAdminEmail.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to add admin')
      }
      setNewAdmin('')
      setNewAdminName('')
      setNewAdminEmail('')
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add admin')
    } finally {
      setLoading(false)
    }
  }

  const handleDeactivate = async (userId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyUserId: userId, action: 'deactivate' }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to deactivate admin')
      }
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate admin')
    } finally {
      setLoading(false)
    }
  }

  const handleActivate = async (userId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyUserId: userId, action: 'activate' }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to activate admin')
      }
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate admin')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Delete this admin user?')) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyUserId: userId }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to delete admin')
      }
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete admin')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (admin: AdminEntry) => {
    setEditingUserId(admin.spotify_user_id)
    setEditingName(admin.display_name || '')
    setEditingEmail(admin.email || '')
  }

  const cancelEdit = () => {
    setEditingUserId(null)
    setEditingName('')
    setEditingEmail('')
  }

  const handleSaveEdit = async (userId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotifyUserId: userId,
          action: 'update',
          displayName: editingName.trim() || null,
          email: editingEmail.trim() || null,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to update admin')
      }
      cancelEdit()
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestAction = async (requestId: number, action: 'approve' | 'deny') => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to update request')
      }
      await Promise.all([loadAdmins(), loadRequests()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 sm:p-10 space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Admin Users</h2>
        <p className="text-sm text-gray-500">
          Add or deactivate Spotify user IDs that should access admin-only features.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={newAdmin}
          onChange={(event) => setNewAdmin(event.target.value)}
          placeholder="Spotify user id (e.g. delman-it)"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="text"
          value={newAdminName}
          onChange={(event) => setNewAdminName(event.target.value)}
          placeholder="Display name (optional)"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="email"
          value={newAdminEmail}
          onChange={(event) => setNewAdminEmail(event.target.value)}
          placeholder="Email (optional)"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading || !newAdmin.trim()}
          className="inline-flex items-center justify-center rounded-full bg-[#18B45A] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#149A4C] disabled:opacity-50"
        >
          Add admin
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
          Admin Access Requests
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-[0.08em] text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">User ID</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Requested</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    {loading ? 'Loading admin requests…' : 'No pending requests.'}
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700 font-medium">{request.spotify_user_id}</td>
                    <td className="px-4 py-3 text-gray-500">{request.display_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{request.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(request.requested_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button
                        type="button"
                        onClick={() => handleRequestAction(request.id, 'approve')}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestAction(request.id, 'deny')}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Deny
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-[0.08em] text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">User ID</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                  {loading ? 'Loading admin users…' : 'No admin users configured.'}
                </td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.spotify_user_id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-700 font-medium">{admin.spotify_user_id}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {editingUserId === admin.spotify_user_id ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    ) : (
                      admin.display_name || '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {editingUserId === admin.spotify_user_id ? (
                      <input
                        type="email"
                        value={editingEmail}
                        onChange={(event) => setEditingEmail(event.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    ) : (
                      admin.email || '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {admin.active ? 'Active' : 'Inactive'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {admin.is_super_admin ? (
                      <span className="text-xs text-gray-400">Super admin</span>
                    ) : editingUserId === admin.spotify_user_id ? (
                      <div className="space-x-3">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(admin.spotify_user_id)}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="space-x-3">
                        <button
                          type="button"
                          onClick={() => startEdit(admin)}
                          className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                        >
                          Edit
                        </button>
                        {admin.active ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(admin.spotify_user_id)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(admin.spotify_user_id)}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                          >
                            Activate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(admin.spotify_user_id)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
