'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PRIORITY_OPTIONS = [
  { value: 'low', label: '低优先级' },
  { value: 'medium', label: '中优先级' },
  { value: 'high', label: '高优先级' },
  { value: 'urgent', label: '紧急' },
]

export default function CreateTicketPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Synchronous submit guard prevents duplicate requests from rapid clicks.
  const isSubmittingRef = useRef(false)
  // Per-session idempotency key for network-retry deduplication.
  const idempotencyKeyRef = useRef(crypto.randomUUID())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // ── Layer 1: synchronous submit lock ──────────────────────────────────
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setError('')

    if (!title.trim()) {
      isSubmittingRef.current = false
      setError('请输入工单标题')
      return
    }

    setLoading(true)

    try {
      // ── Layer 2: call API route with Idempotency-Key header ───────────────
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 401) {
          router.push('/login')
          return
        }
        setError(err.error || '创建失败，请重试')
        setLoading(false)
        return
      }

      const ticket = await res.json()
      idempotencyKeyRef.current = crypto.randomUUID()
      router.push(`/dashboard/tickets/${ticket.id}`)
    } catch {
      setError('操作失败，请重试')
      setLoading(false)
    } finally {
      isSubmittingRef.current = false
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/tickets" className="text-gray-400 hover:text-gray-600 transition-colors">
          ← 返回
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">创建工单</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">工单信息</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                工单标题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="简要描述问题或需求"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                优先级
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">详细描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="详细描述您的问题或需求..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            href="/dashboard/tickets"
            className="flex-1 py-3 text-center text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? '创建中...' : '创建工单'}
          </button>
        </div>
      </form>
    </div>
  )
}
