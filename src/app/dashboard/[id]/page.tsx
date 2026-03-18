'use client'

export const dynamic = 'force-dynamic'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { formatDate, getBaseUrl, copyToClipboard } from '@/lib/utils'
import type { ShortLink, WhatsAppNumber, ClickLog, Platform } from '@/types'

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'line', label: 'LINE' },
]

function getPlatformPlaceholder(platform: Platform): string {
  if (platform === 'telegram') return 'Telegram 用户名'
  if (platform === 'line') return 'LINE ID'
  return '号码（如：8613800138000）'
}

const PLATFORM_LABELS: Record<Platform, string> = {
  whatsapp: 'WA',
  telegram: 'TG',
  line: 'LINE',
}

const PLATFORM_COLORS: Record<Platform, string> = {
  whatsapp: 'bg-green-100 text-green-700',
  telegram: 'bg-blue-100 text-blue-700',
  line: 'bg-emerald-100 text-emerald-700',
}

export default function LinkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [link, setLink] = useState<ShortLink | null>(null)
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([])
  const [logs, setLogs] = useState<ClickLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newPlatform, setNewPlatform] = useState<Platform>('whatsapp')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tiktokPixelEnabled, setTiktokPixelEnabled] = useState(false)
  const [tiktokPixelId, setTiktokPixelId] = useState('')

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
    setTitle(linkData.title || '')
    setDescription(linkData.description || '')
    setTiktokPixelEnabled(linkData.tiktok_pixel_enabled || false)
    setTiktokPixelId(linkData.tiktok_pixel_id || '')

    const { data: numbersData } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('short_link_id', id)
      .order('sort_order', { ascending: true })

    setNumbers(numbersData || [])

    const { data: logsData } = await supabase
      .from('click_logs')
      .select('*, whatsapp_numbers(phone_number, label)')
      .eq('short_link_id', id)
      .order('clicked_at', { ascending: false })
      .limit(50)

    setLogs(logsData || [])
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

    const { error } = await supabase
      .from('short_links')
      .update({
        title: title || null,
        description: description || null,
        tiktok_pixel_enabled: tiktokPixelEnabled,
        tiktok_pixel_id: tiktokPixelEnabled ? tiktokPixelId.trim() : null,
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

  const handleAddNumber = async () => {
    if (!newPhone.trim()) return

    const { error } = await supabase.from('whatsapp_numbers').insert({
      short_link_id: id,
      phone_number: newPhone.trim(),
      label: newLabel.trim() || null,
      sort_order: numbers.length,
      platform: newPlatform,
    })

    if (error) {
      setError('添加失败：' + error.message)
    } else {
      setNewPhone('')
      setNewLabel('')
      setNewPlatform('whatsapp')
      fetchData()
    }
  }

  const handleDeleteNumber = async (numberId: string) => {
    if (!confirm('确定要删除此号码吗？')) return

    const { error } = await supabase
      .from('whatsapp_numbers')
      .delete()
      .eq('id', numberId)

    if (error) {
      setError('删除失败：' + error.message)
    } else {
      fetchData()
    }
  }

  const handleToggleNumber = async (numberId: string, isActive: boolean) => {
    await supabase
      .from('whatsapp_numbers')
      .update({ is_active: !isActive })
      .eq('id', numberId)
    fetchData()
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
  const maxClicks = numbers.length > 0 ? Math.max(...numbers.map((n) => n.click_count), 1) : 1

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
            ← 返回
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {link.title || link.slug}
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">总点击</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{link.total_clicks}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">号码数量</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{numbers.filter(n => n.is_active).length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500 text-sm">创建时间</p>
          <p className="text-sm font-medium text-gray-700 mt-2">{formatDate(link.created_at)}</p>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">基本设置</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
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
                  开启后访客点击短链时自动触发 SubmitForm 事件
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

      {/* Numbers */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">号码管理</h2>

        {/* Number click stats bars */}
        <div className="space-y-3 mb-6">
          {numbers.map((num) => (
            <div key={num.id} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 font-medium flex items-center gap-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[num.platform || 'whatsapp']}`}>
                      {PLATFORM_LABELS[num.platform || 'whatsapp']}
                    </span>
                    {num.phone_number}
                    {num.label && <span className="text-gray-400">({num.label})</span>}
                  </span>
                  <span className="text-gray-500">{num.click_count} 次</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-400 rounded-full transition-all"
                    style={{ width: `${(num.click_count / maxClicks) * 100}%` }}
                  />
                </div>
              </div>
              <button
                onClick={() => handleToggleNumber(num.id, num.is_active)}
                className={`text-xs px-2 py-1 rounded ${num.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {num.is_active ? '启用' : '停用'}
              </button>
              <button
                onClick={() => handleDeleteNumber(num.id)}
                className="text-red-400 hover:text-red-600 text-sm transition-colors"
              >
                删除
              </button>
            </div>
          ))}
        </div>

        {/* Add number */}
        <div className="flex gap-2 pt-4 border-t border-gray-100">
          <select
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value as Platform)}
            className="w-28 px-2 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder={getPlatformPlaceholder(newPlatform)}
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="备注（可选）"
            className="w-28 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          />
          <button
            onClick={handleAddNumber}
            className="px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm transition-colors"
          >
            添加
          </button>
        </div>
      </div>

      {/* Click logs */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">最近点击记录</h2>
        {logs.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无点击记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">时间</th>
                  <th className="pb-3 font-medium">分配号码</th>
                  <th className="pb-3 font-medium">IP 地址</th>
                  <th className="pb-3 font-medium">来源</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-2.5 text-gray-600">{formatDate(log.clicked_at)}</td>
                    <td className="py-2.5 text-gray-800">
                      {log.whatsapp_numbers?.phone_number || '-'}
                      {log.whatsapp_numbers?.label && (
                        <span className="text-gray-400 ml-1">({log.whatsapp_numbers.label})</span>
                      )}
                    </td>
                    <td className="py-2.5 text-gray-500">{log.ip_address || '-'}</td>
                    <td className="py-2.5 text-gray-500 truncate max-w-xs">{log.referer || '直接访问'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
