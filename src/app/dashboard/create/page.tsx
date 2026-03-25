'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { generateSlug, TIKTOK_EVENT_OPTIONS, TikTokEventType } from '@/lib/utils'

export default function CreateLinkPage() {
  const router = useRouter()
  const [slug, setSlug] = useState(generateSlug())
  const [description, setDescription] = useState('')
  const [tiktokPixelEnabled, setTiktokPixelEnabled] = useState(false)
  const [tiktokPixelId, setTiktokPixelId] = useState('')
  const [tiktokEventType, setTiktokEventType] = useState<TikTokEventType>('SubmitForm')
  const [fbPixelEnabled, setFbPixelEnabled] = useState(false)
  const [fbPixelId, setFbPixelId] = useState('')
  const [fbEventType, setFbEventType] = useState<'Lead' | 'Purchase' | 'ViewContent'>('Lead')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [autoReplyMessages, setAutoReplyMessages] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Synchronous submit guard: set synchronously via a ref so that even rapid
  // double-clicks that fire before the `loading` state re-render propagates
  // are blocked immediately. `loading` (useState) is used for UI feedback only.
  const isSubmittingRef = useRef(false)
  // Per-session idempotency key: generated once per form mount so that retries
  // (e.g. after a network timeout) carry the same key and receive the cached result.
  const idempotencyKeyRef = useRef(crypto.randomUUID())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // ── Layer 1: synchronous submit lock ──────────────────────────────────
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setError('')

    if (!slug.trim()) {
      isSubmittingRef.current = false
      setError('请输入短链后缀')
      return
    }

    if (tiktokPixelEnabled && !tiktokPixelId.trim()) {
      isSubmittingRef.current = false
      setError('请输入 TikTok Pixel ID')
      return
    }

    if (fbPixelEnabled && !fbPixelId.trim()) {
      isSubmittingRef.current = false
      setError('请输入 Facebook Pixel ID')
      return
    }

    setLoading(true)

    try {
      // ── Layer 2: call API route with Idempotency-Key header ───────────────
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          slug: slug.trim(),
          description: description.trim() || null,
          tiktok_pixel_enabled: tiktokPixelEnabled,
          tiktok_pixel_id: tiktokPixelEnabled ? tiktokPixelId.trim() : null,
          tiktok_event_type: tiktokPixelEnabled ? tiktokEventType : null,
          fb_pixel_enabled: fbPixelEnabled,
          fb_pixel_id: fbPixelEnabled ? fbPixelId.trim() : null,
          fb_event_type: fbPixelEnabled ? fbEventType : null,
          auto_reply_enabled: autoReplyEnabled,
          auto_reply_messages: autoReplyEnabled && autoReplyMessages.trim() ? autoReplyMessages.trim() : null,
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

      const link = await res.json()
      // Reset idempotency key after success so a new form session gets a fresh key
      idempotencyKeyRef.current = crypto.randomUUID()
      router.push(`/dashboard/${link.id}`)
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
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
          ← 返回
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">创建短链</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">基本信息</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                短链后缀 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  placeholder="custom-slug"
                  pattern="[a-zA-Z0-9\-_]+"
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSlug(generateSlug())}
                  className="px-4 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                >
                  随机生成
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">只能包含字母、数字、横线和下划线</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                链接描述 <span className="text-gray-400 font-normal ml-1">（选填）</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="备注信息..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* TikTok Pixel */}
        <div className="bg-indigo-50 rounded-xl p-6 shadow-sm border border-indigo-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-indigo-900">🎯 TikTok Pixel 设置</h2>
              <p className="text-xs text-indigo-600 mt-1">
                开启后，访客点击短链时会自动触发 TikTok 像素事件，用于广告受众收集
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTiktokPixelEnabled(!tiktokPixelEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                tiktokPixelEnabled ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  tiktokPixelEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {tiktokPixelEnabled && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-indigo-800 mb-1">
                  Pixel ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tiktokPixelId}
                  onChange={(e) => setTiktokPixelId(e.target.value)}
                  placeholder="例如：CXXXXXXXXXX"
                  className="w-full px-4 py-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-800 mb-2">事件类型</label>
                <div className="flex gap-2">
                  {TIKTOK_EVENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTiktokEventType(opt.value)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        tiktokEventType === opt.value
                          ? 'bg-indigo-600 text-white'
                          : 'border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Facebook Pixel */}
        <div className="bg-blue-50 rounded-xl p-6 shadow-sm border border-blue-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-blue-900">📘 Facebook Pixel 设置</h2>
              <p className="text-xs text-blue-600 mt-1">
                开启后访客点击短链时自动触发 Facebook 像素事件
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFbPixelEnabled(!fbPixelEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                fbPixelEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  fbPixelEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {fbPixelEnabled && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-1">
                  Pixel ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fbPixelId}
                  onChange={(e) => setFbPixelId(e.target.value)}
                  placeholder="例如：123456789012345"
                  className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-2">事件类型</label>
                <div className="flex gap-2">
                  {([
                    { value: 'Lead', label: '潜在客户' },
                    { value: 'Purchase', label: '购买' },
                    { value: 'ViewContent', label: '点击' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFbEventType(opt.value)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        fbEventType === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'border border-blue-300 text-blue-700 bg-white hover:bg-blue-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Auto Reply */}
        <div className="bg-yellow-50 rounded-xl p-6 shadow-sm border border-yellow-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-yellow-900">💬 自动回复语</h2>
              <p className="text-xs text-yellow-600 mt-1">
                仅 WhatsApp 号码生效，每个访客会按顺序收到不同的预填消息
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoReplyEnabled ? 'bg-yellow-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {autoReplyEnabled && (
            <div>
              <label className="block text-sm font-medium text-yellow-800 mb-1">
                回复语句（一行一个）
              </label>
              <textarea
                value={autoReplyMessages}
                onChange={(e) => setAutoReplyMessages(e.target.value)}
                rows={4}
                placeholder={'你好\n早上好\n下午好'}
                className="w-full px-4 py-2.5 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none bg-white resize-none text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="flex-1 py-3 text-center text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? '创建中...' : '创建短链'}
          </button>
        </div>
      </form>
    </div>
  )
}
