'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { WhatsAppNumber, ShortLink, Platform } from '@/types'

type NumberWithLink = WhatsAppNumber & { short_links: Pick<ShortLink, 'id' | 'slug' | 'title'> }

const PLATFORM_OPTIONS: { value: Platform | 'all'; label: string }[] = [
  { value: 'all', label: '全部平台' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'line', label: 'LINE' },
]

const PLATFORM_LABELS: Record<Platform, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  line: 'LINE',
}

const PLATFORM_COLORS: Record<Platform, string> = {
  whatsapp: 'bg-green-100 text-green-700',
  telegram: 'bg-blue-100 text-blue-700',
  line: 'bg-emerald-100 text-emerald-700',
}

const DEFAULT_PLATFORM: Platform = 'whatsapp'

function getPlatform(platform: Platform | undefined | null): Platform {
  return platform || DEFAULT_PLATFORM
}

export default function NumbersPage() {
  const [numbers, setNumbers] = useState<NumberWithLink[]>([])
  const [links, setLinks] = useState<ShortLink[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all')
  const [filterLink, setFilterLink] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchPhone, setSearchPhone] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New number form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newPlatform, setNewPlatform] = useState<Platform>('whatsapp')
  const [newLinkId, setNewLinkId] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: linksData } = await supabase
      .from('short_links')
      .select('id, slug, title, user_id, current_index, total_clicks, is_active, tiktok_pixel_enabled, tiktok_pixel_id, description, created_at, updated_at')
      .order('created_at', { ascending: false })

    setLinks(linksData || [])

    const { data: numbersData } = await supabase
      .from('whatsapp_numbers')
      .select('*, short_links(id, slug, title)')
      .order('created_at', { ascending: false })

    setNumbers((numbersData as NumberWithLink[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = numbers.filter((n) => {
    if (filterPlatform !== 'all' && getPlatform(n.platform) !== filterPlatform) return false
    if (filterLink !== 'all' && n.short_link_id !== filterLink) return false
    if (filterStatus === 'active' && !n.is_active) return false
    if (filterStatus === 'inactive' && n.is_active) return false
    if (searchPhone && !n.phone_number.toLowerCase().includes(searchPhone.toLowerCase())) return false
    return true
  })

  const totalClicks = filtered.reduce((sum, n) => sum + n.click_count, 0)

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((n) => n.id)))
    }
  }

  const handleToggle = async (numberId: string, isActive: boolean) => {
    await supabase.from('whatsapp_numbers').update({ is_active: !isActive }).eq('id', numberId)
    fetchData()
  }

  const handleDelete = async (numberId: string) => {
    if (!confirm('确定要删除此号码吗？')) return
    const { error } = await supabase.from('whatsapp_numbers').delete().eq('id', numberId)
    if (error) setError('删除失败：' + error.message)
    else fetchData()
  }

  const handleBulkToggle = async (activate: boolean) => {
    if (selected.size === 0) return
    await supabase
      .from('whatsapp_numbers')
      .update({ is_active: activate })
      .in('id', Array.from(selected))
    setSelected(new Set())
    fetchData()
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`确定要删除选中的 ${selected.size} 个号码吗？`)) return
    await supabase.from('whatsapp_numbers').delete().in('id', Array.from(selected))
    setSelected(new Set())
    fetchData()
  }

  const handleExport = () => {
    const rows = [['号码ID', '链接URL', '号码', '号码类型', '访问次数', '状态', '备注']]
    filtered.forEach((n) => {
      rows.push([
        n.id,
        n.short_links?.slug || '',
        n.phone_number,
        PLATFORM_LABELS[getPlatform(n.platform)],
        String(n.click_count),
        n.is_active ? '启用' : '停用',
        n.label || '',
      ])
    })
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'numbers.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddNumber = async () => {
    if (!newPhone.trim() || !newLinkId) {
      setError('请填写号码并选择关联链接')
      return
    }
    setAdding(true)
    const { error } = await supabase.from('whatsapp_numbers').insert({
      phone_number: newPhone.trim(),
      label: newLabel.trim() || null,
      platform: newPlatform,
      short_link_id: newLinkId,
      sort_order: 0,
    })
    setAdding(false)
    if (error) {
      setError('添加失败：' + error.message)
    } else {
      setSuccess('添加成功')
      setTimeout(() => setSuccess(''), 3000)
      setNewPhone('')
      setNewLabel('')
      setNewPlatform('whatsapp')
      setNewLinkId('')
      setShowAddForm(false)
      fetchData()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📱 号码管理</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ⬆️ 导出
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
          >
            ➕ 新增号码
          </button>
        </div>
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

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">新增号码</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联链接 <span className="text-red-500">*</span></label>
              <select
                value={newLinkId}
                onChange={(e) => setNewLinkId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
              >
                <option value="">请选择链接</option>
                {links.map((l) => (
                  <option key={l.id} value={l.id}>{l.title || l.slug}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">平台</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as Platform)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="line">LINE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">号码 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder={newPlatform === 'whatsapp' ? '8613800138000' : newPlatform === 'telegram' ? 'Telegram 用户名' : 'LINE ID'}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="备注（可选）"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleAddNumber}
              disabled={adding}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm transition-colors"
            >
              {adding ? '添加中...' : '确认添加'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterLink}
            onChange={(e) => setFilterLink(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
          >
            <option value="all">全部链接</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>{l.title || l.slug}</option>
            ))}
          </select>
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value as Platform | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
          >
            <option value="all">全部状态</option>
            <option value="active">已启用</option>
            <option value="inactive">已停用</option>
          </select>
          <input
            type="text"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            placeholder="搜索号码..."
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
          />
        </div>
      </div>

      {/* Bulk Actions + Stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-gray-600">已选 {selected.size} 个</span>
              <button
                onClick={() => handleBulkToggle(true)}
                className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
              >
                批量启用
              </button>
              <button
                onClick={() => handleBulkToggle(false)}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              >
                批量停用
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
              >
                批量删除
              </button>
            </>
          )}
        </div>
        <div className="text-sm text-gray-500">
          本页访问次数合计：<span className="font-semibold text-gray-800">{totalClicks}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="py-3 px-4 font-medium">链接</th>
                <th className="py-3 px-4 font-medium">号码</th>
                <th className="py-3 px-4 font-medium">号码类型</th>
                <th className="py-3 px-4 font-medium">访问次数</th>
                <th className="py-3 px-4 font-medium">状态</th>
                <th className="py-3 px-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    暂无号码数据
                  </td>
                </tr>
              ) : (
                filtered.map((num) => (
                  <tr key={num.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selected.has(num.id)}
                        onChange={() => toggleSelect(num.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {num.short_links?.slug || '-'}
                      </span>
                      {num.short_links?.title && (
                        <span className="text-gray-400 ml-1 text-xs">({num.short_links.title})</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-800">
                      <span className="font-medium">{num.phone_number}</span>
                      {num.label && <span className="text-gray-400 ml-1 text-xs">({num.label})</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${PLATFORM_COLORS[getPlatform(num.platform)]}`}>
                        {PLATFORM_LABELS[getPlatform(num.platform)]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{num.click_count}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${num.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {num.is_active ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggle(num.id, num.is_active)}
                          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          {num.is_active ? '停用' : '启用'}
                        </button>
                        <button
                          onClick={() => handleDelete(num.id)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
