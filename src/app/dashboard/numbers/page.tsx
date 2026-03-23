'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'
import type { WhatsAppNumber, ShortLink, Platform } from '@/types'
import Pagination from '@/components/ui/Pagination'

type NumberWithLink = WhatsAppNumber & { short_links: Pick<ShortLink, 'id' | 'slug' | 'title'> }

const PLATFORM_OPTIONS: { value: Platform | 'all'; label: string }[] = [
  { value: 'all', label: '全部平台' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'line', label: 'LINE' },
  { value: 'custom', label: '自定义' },
]

const PLATFORM_LABELS: Record<Platform, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  line: 'LINE',
  custom: '自定义',
}

const PLATFORM_COLORS: Record<Platform, string> = {
  whatsapp: 'bg-green-100 text-green-700',
  telegram: 'bg-blue-100 text-blue-700',
  line: 'bg-emerald-100 text-emerald-700',
  custom: 'bg-purple-100 text-purple-700',
}

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

const DEFAULT_PLATFORM: Platform = 'whatsapp'

function getPlatform(platform: Platform | undefined | null): Platform {
  return platform || DEFAULT_PLATFORM
}

/** Searchable dropdown for selecting a phone number filter. */
function PhoneSelect({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (phone: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div ref={ref} className="relative min-w-48">
      <button
        type="button"
        onClick={() => { setOpen((prev) => !prev); setSearch('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value || '搜索号码...'}</span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索号码..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${!value ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
              >
                全部号码
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((phone) => (
                <li key={phone}>
                  <button
                    type="button"
                    onClick={() => { onChange(phone); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${value === phone ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
                  >
                    <span className="font-mono">{phone}</span>
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

/** Searchable dropdown for selecting a short link in the Add Number modal. */
function LinkSelect({
  options,
  value,
  onChange,
}: {
  options: ShortLink[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = options.filter((l) => {
    const q = search.toLowerCase()
    return (l.title || '').toLowerCase().includes(q) || l.slug.toLowerCase().includes(q)
  })

  const selected = options.find((l) => l.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((prev) => !prev); setSearch('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? (selected.title || selected.slug) : '请选择要绑定的短链'}
        </span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入链接名称快速搜索..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${!value ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
              >
                请选择要绑定的短链
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(l.id); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${value === l.id ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
                  >
                    {l.title || l.slug}
                    {l.title && <span className="text-gray-400 ml-1 text-xs font-mono">({l.slug})</span>}
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

export default function NumbersPage() {
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all')
  const [filterLink, setFilterLink] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchPhone, setSearchPhone] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [modalLinkId, setModalLinkId] = useState('')
  const [modalPlatform, setModalPlatform] = useState<Platform>('whatsapp')
  const [modalLabel, setModalLabel] = useState('')
  const [modalNumbers, setModalNumbers] = useState('')
  const [modalStatus, setModalStatus] = useState<'active' | 'inactive'>('active')
  const [adding, setAdding] = useState(false)

  const { data: userInfo } = useSWR('numbersCurrentUser', async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const role = profile?.role
    const isRoot = user.email === ROOT_ADMIN_EMAIL || role === 'root' || role === 'root_admin'
    return {
      userId: user.id,
      isAdmin: role === 'admin' || role === 'root' || role === 'root_admin',
      isRoot,
    }
  })

  const currentUserId = userInfo?.userId ?? null
  const isAdmin = userInfo?.isAdmin ?? false
  const isRoot = userInfo?.isRoot ?? false

  const { data: allPhones = [] } = useSWR<string[]>(
    currentUserId ? ['allPhones', currentUserId, isAdmin, isRoot] : null,
    async ([, uid, , root]: [string, string, boolean, boolean]) => {
      let query = supabase
        .from('whatsapp_numbers')
        .select('phone_number, short_links!inner(user_id)')
        .order('phone_number', { ascending: true })
      if (!root) {
        // Non-root (including regular admin) only sees their own links' numbers
        query = query.eq('short_links.user_id', uid).eq('is_hidden', false)
      }
      const { data } = await query
      return data ? Array.from(new Set(data.map((r: { phone_number: string }) => r.phone_number))) : []
    }
  )

  const { data: mainData, isValidating, mutate } = useSWR(
    currentUserId
      ? ['/api/numbers', filterPlatform, filterLink, filterStatus, searchPhone, page, pageSize, currentUserId, isAdmin, isRoot]
      : null,
    async ([, fPlatform, fLink, fStatus, sPhone, p, ps, uid, , root]: [
      string, Platform | 'all', string, 'all' | 'active' | 'inactive', string, number, number, string, boolean, boolean
    ]) => {
      const { data: linksData, error: linksError } = await supabase
        .from('short_links')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (linksError) throw linksError

      let query = supabase
        .from('whatsapp_numbers')
        .select('*, short_links(id, slug, title)', { count: 'exact' })
        .order('created_at', { ascending: false })

      const linkIds = (linksData || []).map((l: { id: string }) => l.id)
      if (!root) {
        // Non-root users (including regular admin) only see their own links' numbers
        query = query.eq('is_hidden', false)
        if (linkIds.length === 0) {
          return { numbers: [], totalCount: 0, links: [] }
        }
        query = query.in('short_link_id', linkIds)
      }
      // Root admin sees all numbers without filter
      if (fPlatform !== 'all') {
        query = query.eq('platform', fPlatform)
      }
      if (fLink !== 'all') {
        query = query.eq('short_link_id', fLink)
      }
      if (fStatus === 'active') {
        query = query.eq('is_active', true)
      } else if (fStatus === 'inactive') {
        query = query.eq('is_active', false)
      }
      if (sPhone) {
        query = query.eq('phone_number', sPhone)
      }

      const from = (p - 1) * ps
      query = query.range(from, from + ps - 1)

      const { data: numbersData, count, error } = await query
      if (error) throw error

      return {
        numbers: (numbersData as NumberWithLink[]) || [],
        totalCount: count || 0,
        links: (linksData || []) as ShortLink[],
      }
    },
    { keepPreviousData: true, revalidateOnFocus: true }
  )

  const numbers = mainData?.numbers ?? []
  const totalCount = mainData?.totalCount ?? 0
  const links = mainData?.links ?? []
  const loading = !mainData && isValidating

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === numbers.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(numbers.map((n) => n.id)))
    }
  }

  const handleToggleActive = async (numberId: string, currentStatus: boolean) => {
    await supabase.from('whatsapp_numbers').update({ is_active: !currentStatus }).eq('id', numberId)
    mutate()
  }

  const handleDelete = async (numberId: string) => {
    if (!confirm('确定要删除此号码吗？')) return
    const { error } = await supabase.from('whatsapp_numbers').delete().eq('id', numberId)
    if (error) setError('删除失败：' + error.message)
    else mutate()
  }

  const handleBulkToggle = async (activate: boolean) => {
    if (selected.size === 0) return
    await supabase
      .from('whatsapp_numbers')
      .update({ is_active: activate })
      .in('id', Array.from(selected))
    setSelected(new Set())
    mutate()
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`确定要删除选中的 ${selected.size} 个号码吗？`)) return
    await supabase.from('whatsapp_numbers').delete().in('id', Array.from(selected))
    setSelected(new Set())
    mutate()
  }

  const handleExport = () => {
    const rows = [['号码ID', '链接URL', '号码', '号码类型', '访问次数', '状态', '备注']]
    numbers.forEach((n) => {
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

  const handleAddNumbers = async () => {
    if (!modalLinkId) {
      setError('请选择关联链接')
      return
    }
    const lines = modalNumbers.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      setError('请输入至少一个号码')
      return
    }
    setAdding(true)
    const inserts = lines.map((phone) => ({
      phone_number: phone,
      label: modalLabel.trim() || null,
      platform: modalPlatform,
      short_link_id: modalLinkId,
      sort_order: 0,
      is_active: modalStatus === 'active',
    }))
    const { error } = await supabase.from('whatsapp_numbers').insert(inserts)
    setAdding(false)
    if (error) {
      setError('添加失败：' + error.message)
    } else {
      setSuccess(`成功添加 ${lines.length} 个号码`)
      setTimeout(() => setSuccess(''), 3000)
      setModalLinkId('')
      setModalPlatform('whatsapp')
      setModalLabel('')
      setModalNumbers('')
      setModalStatus('active')
      setShowModal(false)
      mutate()
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
            onClick={() => { setError(''); setShowModal(true) }}
            className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
          >
            + 新增
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

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterLink}
            onChange={(e) => { setFilterLink(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
          >
            <option value="all">全部链接</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>{l.title || l.slug}</option>
            ))}
          </select>
          <select
            value={filterPlatform}
            onChange={(e) => { setFilterPlatform(e.target.value as Platform | 'all'); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as 'all' | 'active' | 'inactive'); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
          >
            <option value="all">全部状态</option>
            <option value="active">已启用</option>
            <option value="inactive">已停用</option>
          </select>
          <PhoneSelect
            options={allPhones}
            value={searchPhone}
            onChange={(phone) => { setSearchPhone(phone); setPage(1) }}
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
          本页访问次数合计：<span className="font-semibold text-gray-800">{numbers.reduce((sum, n) => sum + n.click_count, 0)}</span>
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
                    checked={numbers.length > 0 && selected.size === numbers.length}
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
              {numbers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    暂无号码数据
                  </td>
                </tr>
              ) : (
                numbers.map((num) => (
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
                      <button
                        onClick={() => handleToggleActive(num.id, num.is_active)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          num.is_active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          num.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDelete(num.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        />
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">新增号码</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  号码类型
                </label>
                <select
                  value={modalPlatform}
                  onChange={(e) => setModalPlatform(e.target.value as Platform)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="line">LINE</option>
                  <option value="custom">自定义</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择链接 <span className="text-red-500">*</span>
                </label>
                <LinkSelect
                  options={links}
                  value={modalLinkId}
                  onChange={setModalLinkId}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工单号 / 备注</label>
                <input
                  type="text"
                  value={modalLabel}
                  onChange={(e) => setModalLabel(e.target.value)}
                  placeholder="备注（可选）"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  号码 <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">（一行一个，支持批量）</span>
                </label>
                <textarea
                  value={modalNumbers}
                  onChange={(e) => setModalNumbers(e.target.value)}
                  rows={5}
                  placeholder={
                    modalPlatform === 'whatsapp'
                      ? '8613800138000\n8613900139000\n...'
                      : modalPlatform === 'telegram'
                      ? 'username1\nusername2\n...'
                      : modalPlatform === 'line'
                      ? 'lineid1\nlineid2\n...'
                      : 'https://example.com/1\nhttps://example.com/2\n...'
                  }
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="modalStatus"
                      value="active"
                      checked={modalStatus === 'active'}
                      onChange={() => setModalStatus('active')}
                      className="text-green-500"
                    />
                    <span className="text-sm text-gray-700">正常</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="modalStatus"
                      value="inactive"
                      checked={modalStatus === 'inactive'}
                      onChange={() => setModalStatus('inactive')}
                      className="text-green-500"
                    />
                    <span className="text-sm text-gray-700">停用</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddNumbers}
                  disabled={adding}
                  className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {adding ? '添加中...' : '确定'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
