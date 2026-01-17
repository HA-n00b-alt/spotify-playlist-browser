'use client'

import { useEffect, useState } from 'react'

export default function SpotifyAccessRequestForm() {
  const [requestStatus, setRequestStatus] = useState<'idle' | 'requested' | 'pending' | 'error'>('idle')
  const [requestMessage, setRequestMessage] = useState<string | null>(null)
  const [requestName, setRequestName] = useState('')
  const [requestEmail, setRequestEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setRequestName(data.user.display_name || data.user.id || '')
          setRequestEmail(data.user.email || '')
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async () => {
    const trimmedEmail = requestEmail.trim()
    if (!trimmedEmail) {
      setRequestStatus('error')
      setRequestMessage('Email is required to request access.')
      return
    }

    setIsSubmitting(true)
    setRequestStatus('idle')
    setRequestMessage(null)
    try {
      const res = await fetch('/api/spotify-access/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: requestName.trim(),
          email: trimmedEmail,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Unable to submit request.')
      }
      const data = await res.json().catch(() => ({}))
      const status = data?.status === 'pending' ? 'pending' : 'requested'
      setRequestStatus(status)
      setRequestMessage(
        status === 'pending'
          ? 'Request already pending.'
          : 'Request submitted. We will review and add you shortly.'
      )
    } catch (error) {
      setRequestStatus('error')
      setRequestMessage(error instanceof Error ? error.message : 'Unable to submit request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-400">
        Request Spotify API Access
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
        This app requires allowlist access in the Spotify developer portal. Submit your details so we can add you.
      </p>
      <div className="mt-4 space-y-2">
        <input
          type="text"
          value={requestName}
          onChange={(event) => setRequestName(event.target.value)}
          placeholder="Display name"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <input
          type="email"
          value={requestEmail}
          onChange={(event) => setRequestEmail(event.target.value)}
          placeholder="Email address"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {isSubmitting ? 'Submitting...' : 'Request access'}
        </button>
        {requestMessage ? (
          <div className={`text-xs ${requestStatus === 'error' ? 'text-rose-600' : 'text-gray-500 dark:text-slate-400'}`}>
            {requestMessage}
          </div>
        ) : null}
      </div>
    </div>
  )
}
