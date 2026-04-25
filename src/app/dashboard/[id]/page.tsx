'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { getBaseUrl, copyToClipboard, TIKTOK_PIXEL_EVENTS, FB_PIXEL_EVENTS, TikTokEventType, FbEventType } from '@/lib/utils'
import { COUNTRIES } from '@/lib/countries'
import type { ShortLink } from '@/types'
import { useTopProgress } from '@/context/ProgressContext'
import { useToast } from '@/context/ToastContext'

const ROOT_ADMIN_EMAIL = process.env.NEXT_PUBLIC_ROOT_ADMIN_EMAIL!

/** Multi-select dropdown for countries with search. */
function CountryMultiSelect({
  value,
  onChange,
}: {
  value: string[]
  onChange: (codes: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = COUNTRIES.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.includes(search)
  )

  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter((c) => c !== code))
    } else {
      onChange([...value, code])
    }
  }

  const displayText =
    value.length === 0
      ? '选择投放地区...'
      : value.length <= 3
        ? value
          .map((c) => {
            const found = COUNTRIES.find((co) => co.code === c)
            return found ? `${found.code} ${found.name}` : c
          })
          .join(', ')
        : `已选 ${value.length} 个地区`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((p) => !p); setSearch('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors"
      >
        <span className={value.length > 0 ? 'text-gray-900' : 'text-gray-400'}>{displayText}</span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索国家/地区..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
          {value.length > 0 && (
            <div className="px-3 py-1.5 border-b border-gray-100">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-red-500 hover:text-red-700"
              >
                清空所有选择
              </button>
            </div>
          )}
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => toggle(c.code)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-purple-50 transition-colors ${
                      value.includes(c.code) ? 'text-purple-700 bg-purple-50' : 'text-gray-700'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      value.includes(c.code) ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300'
                    }`}>
                      {value.includes(c.code) && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="font-mono text-xs text-gray-500">{c.code}</span>
                    <span>{c.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function LinkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { start, done } = useTopProgress()
  const { showToast } = useToast()
  const [link, setLink] = useState<ShortLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const [description, setDescription] = useState('')
  const [tiktokPixelEnabled, setTiktokPixelEnabled] = useState(false)
  const [tiktokPixelId, setTiktokPixelId] = useState('')
  const [tiktokEventType, setTiktokEventType] = useState<TikTokEventType>('SubmitForm')
  const [fbPixelEnabled, setFbPixelEnabled] = useState(false)
  const [fbPixelId, setFbPixelId] = useState('')
  const [fbEventType, setFbEventType] = useState<FbEventType>('Lead')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [autoReplyMessages, setAutoReplyMessages] = useState('')
  // Cloak state
  const [cloakEnabled, setCloakEnabled] = useState(false)
  const [cloakAuditUrl, setCloakAuditUrl] = useState('')
  const [cloakMode, setCloakMode] = useState<'cloak' | 'open' | 'audit'>('cloak')
  const [cloakRegions, setCloakRegions] = useState<string[]>([])
  const [cloakSources, setCloakSources] = useState<string[]>([])
  const [cloakBlockIp, setCloakBlockIp] = useState(false)
  const [cloakBlockPc, setCloakBlockPc] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/dashboard')
      return
    }
    setUserId(user.id)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const role = profile?.role
    const admin = role === 'admin' || role === 'root' || role === 'root_admin'
    setIsAdmin(admin)
    // Only root admin (by email or root/root_admin role) can view other users' links;
    // regular admins are restricted to their own links
    const isRoot = user.email === ROOT_ADMIN_EMAIL || role === 'root' || role === 'root_admin'

    let query = supabase
      .from('short_links')
      .select('*')
      .eq('id', id)
    if (!isRoot) {
      query = query.eq('user_id', user.id)
    }
    const { data: linkData } = await query.single()

    if (!linkData) {
      router.push('/dashboard')
      return
    }

    setLink(linkData)
    setDescription(linkData.description || '')
    setTiktokPixelEnabled(linkData.tiktok_pixel_enabled || false)
    setTiktokPixelId(linkData.tiktok_pixel_id || '')
    setTiktokEventType((linkData.tiktok_event_type as TikTokEventType) || 'SubmitForm')
    setFbPixelEnabled(linkData.fb_pixel_enabled || false)
    setFbPixelId(linkData.fb_pixel_id || '')
    setFbEventType((linkData.fb_event_type as 'Lead' | 'Purchase' | 'ViewContent') || 'Lead')
    setAutoReplyEnabled(linkData.auto_reply_enabled || false)
    setAutoReplyMessages(linkData.auto_reply_messages || '')
    setCloakEnabled(linkData.cloak_enabled || false)
    setCloakAuditUrl(linkData.cloak_audit_url || '')
    setCloakMode((linkData.cloak_mode as 'cloak' | 'open' | 'audit') || 'cloak')
    setCloakRegions(linkData.cloak_target_regions || [])
    setCloakSources(linkData.cloak_sources || [])
    setCloakBlockIp(linkData.cloak_block_ip_repeat || false)
    setCloakBlockPc(linkData.cloak_block_pc || false)

    setLoading(false)
  }, [id, router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    start()

    if (tiktokPixelEnabled && !tiktokPixelId.trim()) {
      setError('请输入 TikTok Pixel ID')
      setSaving(false)
      done()
      return
    }

    if (fbPixelEnabled && !fbPixelId.trim()) {
      setError('请输入 Facebook Pixel ID')
      setSaving(false)
      done()
      return
    }

    if (cloakEnabled && cloakMode === 'cloak' && cloakRegions.length === 0) {
      setError('斗篷模式下必须至少选择一个投放地区')
      setSaving(false)
      done()
      return
    }

    try {
      let updateQuery = supabase
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
          cloak_enabled: cloakEnabled,
          cloak_audit_url: cloakEnabled && cloakAuditUrl.trim() ? cloakAuditUrl.trim() : null,
          cloak_mode: cloakEnabled ? cloakMode : 'cloak',
          cloak_target_regions: cloakEnabled ? cloakRegions : [],
          cloak_sources: cloakEnabled ? cloakSources : [],
          cloak_block_ip_repeat: cloakEnabled ? cloakBlockIp : false,
          cloak_block_pc: cloakEnabled ? cloakBlockPc : false,
        })
        .eq('id', id)
      if (!isAdmin && userId) {
        updateQuery = updateQuery.eq('user_id', userId)
      }
      const { error } = await updateQuery

      if (error) {
        setError('保存失败：' + error.message)
        showToast('保存失败：' + error.message, 'error')
      } else {
        setSuccess('保存成功')
        setTimeout(() => setSuccess(''), 3000)
        showToast('保存成功', 'success')
      }
    } finally {
      setSaving(false)
      done()
    }
  }

  const handleDeleteLink = async () => {
    if (!confirm('确定要删除此短链吗？此操作不可撤销。')) return

    start()
    try {
      let deleteQuery = supabase.from('short_links').delete().eq('id', id)
      if (!isAdmin && userId) {
        deleteQuery = deleteQuery.eq('user_id', userId)
      }
      await deleteQuery
      showToast('短链已删除', 'success')
      done()
      router.push('/dashboard')
    } catch {
      showToast('删除失败', 'error')
      done()
    }
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
                  <select
                    value={tiktokEventType}
                    onChange={(e) => setTiktokEventType(e.target.value as TikTokEventType)}
                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none bg-white text-sm"
                  >
                    {TIKTOK_PIXEL_EVENTS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
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
                  <select
                    value={fbEventType}
                    onChange={(e) => setFbEventType(e.target.value as FbEventType)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none bg-white text-sm"
                  >
                    {FB_PIXEL_EVENTS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
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

          {/* Cloak */}
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-purple-900 text-sm">🛡️ 斗篷功能</p>
                <p className="text-xs text-purple-600 mt-0.5">
                  开启后根据规则区分真实用户与审核员，分别跳转不同链接
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloakEnabled(!cloakEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  cloakEnabled ? 'bg-purple-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    cloakEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {cloakEnabled && (
              <div className="space-y-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-purple-800 mb-1">
                    审核链接 <span className="text-gray-400 font-normal">（选填，留空则跳转 google.com）</span>
                  </label>
                  <input
                    type="url"
                    value={cloakAuditUrl}
                    onChange={(e) => setCloakAuditUrl(e.target.value)}
                    placeholder="https://www.example.com"
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-purple-800 mb-2">模式 <span className="text-red-500">*</span></label>
                  <div className="space-y-1">
                    {([
                      { value: 'cloak', label: '斗篷', desc: '只有投放地区客户能访问真实链接' },
                      { value: 'open', label: '全开', desc: '所有点击都会访问真实链接' },
                      { value: 'audit', label: '审核', desc: '所有点击都会访问审核链接' },
                    ] as const).map((opt) => (
                      <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="cloakMode"
                          value={opt.value}
                          checked={cloakMode === opt.value}
                          onChange={() => setCloakMode(opt.value)}
                          className="mt-0.5 accent-purple-600"
                        />
                        <span className="text-sm text-purple-900 font-medium">{opt.label}</span>
                        <span className="text-xs text-purple-600">{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-purple-800 mb-1">
                    投放地区 <span className="text-red-500">*</span>
                    <span className="text-gray-400 font-normal ml-1">（斗篷模式必填）</span>
                  </label>
                  <CountryMultiSelect value={cloakRegions} onChange={setCloakRegions} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-purple-800 mb-2">
                    来源 <span className="text-gray-400 font-normal">（多选，仅斗篷模式生效）</span>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {(['tiktok', 'facebook', 'x', 'google', 'instagram'] as const).map((src) => {
                      const labels: Record<string, string> = { tiktok: 'TikTok', facebook: 'Facebook', x: 'X', google: 'Google', instagram: 'Instagram' }
                      return (
                        <label key={src} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cloakSources.includes(src)}
                            onChange={() =>
                              setCloakSources((prev) =>
                                prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
                              )
                            }
                            className="accent-purple-600 w-3.5 h-3.5"
                          />
                          <span className="text-xs text-purple-900">{labels[src]}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cloakBlockIp}
                      onChange={() => setCloakBlockIp(!cloakBlockIp)}
                      className="accent-purple-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-purple-900 font-medium">屏蔽 IP</span>
                    <span
                      title="开启后，符合斗篷条件的用户首次点击会进入真实链接，第二次起进入审核链接，防止同一客户反复添加多位客服。"
                      className="text-xs text-purple-400 cursor-help border border-purple-300 rounded-full w-4 h-4 flex items-center justify-center shrink-0"
                    >
                      ?
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cloakBlockPc}
                      onChange={() => setCloakBlockPc(!cloakBlockPc)}
                      className="accent-purple-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-purple-900 font-medium">屏蔽 PC</span>
                    <span className="text-xs text-purple-600">电脑端访问走审核链接</span>
                  </label>
                </div>
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
