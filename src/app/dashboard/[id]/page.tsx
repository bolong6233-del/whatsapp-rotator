'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { getBaseUrl, copyToClipboard } from '@/lib/utils'
import type { ShortLink } from '@/types'

export default function LinkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [link, setLink] = useState<ShortLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const [description, setDescription] = useState('')
  const [tiktokPixelEnabled, setTiktokPixelEnabled] = useState(false)
  const [tiktokPixelId, setTiktokPixelId] = useState('')
  const [tiktokEventType, setTiktokEventType] = useState<'SubmitForm' | 'CompletePayment' | 'ClickButton'>('SubmitForm')
  const [fbPixelEnabled, setFbPixelEnabled] = useState(false)
  const [fbPixelId, setFbPixelId] = useState('')
  const [fbEventType, setFbEventType] = useState<'Lead' | 'Purchase' | 'ViewContent'>('Lead')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [autoReplyMessages, setAutoReplyMessages] = useState('')

  const fetchData = useCallback(async () => {
    const { data: linkData } = await supabase
      .from('short_links')
      .select('*')
      .eq('id', id)
      .single()

    if (!linkData) {
      router.push('/dashboard')
      return
    }

    setLink(linkData)
    setDescription(linkData.description || '')
    setTiktokPixelEnabled(linkData.tiktok_pixel_enabled || false)
    setTiktokPixelId(linkData.tiktok_pixel_id || '')
    setTiktokEventType((linkData.tiktok_event_type as 'SubmitForm' | 'CompletePayment' | 'ClickButton') || 'SubmitForm')
    setFbPixelEnabled(linkData.fb_pixel_enabled || false)
    setFbPixelId(linkData.fb_pixel_id || '')
    setFbEventType((linkData.fb_event_type as 'Lead' | 'Purchase' | 'ViewContent') || 'Lead')
    setAutoReplyEnabled(linkData.auto_reply_enabled || false)
    setAutoReplyMessages(linkData.auto_reply_messages || '')

    setLoading(false)
  }, [id, router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    if (tiktokPixelEnabled && !tiktokPixelId.trim()) {
      setError('请输入 TikTok Pixel ID')
      setSaving(false)
      return
    }

    if (fbPixelEnabled && !fbPixelId.trim()) {
      setError('请输入 Facebook Pixel ID')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('short_links')
      .update({
        description: description || null,
        tiktok_pixel_enabled: tiktokPixelEnabled,
        tiktok_pixel_id: tiktokPixelEnabled ? tiktokPixelId.trim() : null,
        tiktok_access_token: null,
        tiktok_event_type: tiktokPixelEnabled ? tiktokEventType : null,
        fb_pixel_enabled: fbPixelEnabled,
        fb_pixel_id: fbPixelEnabled ? fbPixelId.trim() : null,
        fb_event_type: fbPixelEnabled ? fbEventType : null,
        auto_reply_enabled: autoReplyEnabled,
        auto_reply_messages: autoReplyEnabled && autoReplyMessages.trim() ? autoReplyMessages.trim() : null,
      })
      .eq('id', id)

    if (error) {
      setError('保存失败：' + error.message)
    } else {
      setSuccess('保存成功')
      setTimeout(() => setSuccess(''), 3000)
    }
    setSaving(false)
  }

  const handleDeleteLink = async () => {
    if (!confirm('确定要删除此短链吗？此操作不可撤销。')) return

    await supabase.from('short_links').delete().eq('id', id)
    router.push('/dashboard')
  }

  const handleCopy = async () => {
    const url = `${getBaseUrl()}/${link?.slug}`
    const ok = await copyToClipboard(url)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!link) return null

  const shortUrl = `${getBaseUrl()}/${link.slug}`

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
            ← 返回
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {link.slug}
          </h1>
          <span className={`px-2 py-0.5 text-xs rounded-full ${link.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {link.is_active ? '活跃' : '已停用'}
          </span>
        </div>
        <button
          onClick={handleDeleteLink}
          className="text-red-400 hover:text-red-600 text-sm transition-colors"
        >
          删除短链
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Short URL */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <p className="text-sm text-gray-500 mb-2">短链地址</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 bg-gray-50 px-4 py-2.5 rounded-lg text-green-700 font-mono text-sm border border-gray-200">
            {shortUrl}
          </code>
          <button
            onClick={handleCopy}
            className="px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm transition-colors"
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
          >
            测试
          </a>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">基本设置</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              链接描述 <span className="text-gray-400 font-normal ml-1">（选填）</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* TikTok Pixel */}
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-indigo-900 text-sm">🎯 TikTok Pixel</p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  开启后访客点击短链时自动触发 TikTok 像素事件
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
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-indigo-800 mb-1">Pixel ID</label>
                  <input
                    type="text"
                    value={tiktokPixelId}
                    onChange={(e) => setTiktokPixelId(e.target.value)}
                    placeholder="例如：CXXXXXXXXXX"
                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-800 mb-2">事件类型</label>
                  <div className="flex gap-2">
                    {([
                      { value: 'SubmitForm', label: '提交表单' },
                      { value: 'CompletePayment', label: '转化' },
                      { value: 'ClickButton', label: '点击' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTiktokEventType(opt.value)}
                        className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
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
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-blue-900 text-sm">📘 Facebook Pixel</p>
                <p className="text-xs text-blue-600 mt-0.5">
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
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-blue-800 mb-1">Pixel ID</label>
                  <input
                    type="text"
                    value={fbPixelId}
                    onChange={(e) => setFbPixelId(e.target.value)}
                    placeholder="例如：123456789012345"
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-800 mb-2">事件类型</label>
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
                        className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
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
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-yellow-900 text-sm">💬 自动回复语</p>
                <p className="text-xs text-yellow-600 mt-0.5">
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
                <label className="block text-xs font-medium text-yellow-800 mb-1">回复语句（一行一个）</label>
                <textarea
                  value={autoReplyMessages}
                  onChange={(e) => setAutoReplyMessages(e.target.value)}
                  rows={4}
                  placeholder={'你好\n早上好\n下午好'}
                  className="w-full px-3 py-2 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none bg-white text-sm resize-none"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg font-medium transition-colors"
          >
            {saving ? '保存中...' : '保存更改'}
          </button>
        </div>
      </div>
    </div>
  )
}
