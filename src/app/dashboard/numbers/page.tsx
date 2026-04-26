'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'
import type { WhatsAppNumber, ShortLink, Platform } from '@/types'
import Pagination from '@/components/ui/Pagination'
import { useTopProgress } from '@/context/ProgressContext'
import { useToast } from '@/context/ToastContext'

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

const ROOT_ADMIN_EMAIL = process.env.NEXT_PUBLIC_ROOT_ADMIN_EMAIL!

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

/** Searchable dropdown for filtering by work order (label). */
function WorkOrderSelect({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (label: string) => void
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
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value || '搜索工单...'}</span>
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
              placeholder="搜索工单..."
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
                全部工单
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((label) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => { onChange(label); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${value === label ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
                  >
                    {label}
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
  const { start, done } = useTopProgress()
  const { showToast } = useToast()

  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all')
  const [filterLink, setFilterLink] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchPhone, setSearchPhone] = useState('')
  const [searchLabel, setSearchLabel] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [modalLinkId, setModalLinkId] = useState('')
  const [modalPlatform, setModalPlatform] = useState<Platform>('whatsapp')
  const [modalLabel, setModalLabel] = useState('')
  const [modalNumbers, setModalNumbers] = useState('')
  const [modalStatus, setModalStatus] = useState<'active' | 'inactive'>('active')
  const [adding, setAdding] = useState(false)

  // Bulk delete modal state
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [bulkDeleteLinkId, setBulkDeleteLinkId] = useState('')
  const [bulkDeleteNumbers, setBulkDeleteNumbers] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editId, setEditId] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editPlatform, setEditPlatform] = useState<Platform>('whatsapp')
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active')
  const [editSaving, setEditSaving] = useState(false)

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

  const { data: allLabels = [] } = useSWR<string[]>(
    currentUserId ? ['allLabels', currentUserId, isAdmin, isRoot] : null,
    async ([, uid, _isAdmin, root]: [string, string, boolean, boolean]) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      let query = supabase
        .from('whatsapp_numbers')
        .select('label, short_links!inner(user_id)')
        .not('label', 'is', null)
        .order('label', { ascending: true })
      if (!root) {
        query = query.eq('short_links.user_id', uid).eq('is_hidden', false)
      }
      const { data } = await query
      return data
        ? Array.from(new Set(data.map((r: { label: string | null }) => r.label).filter(Boolean) as string[]))
        : []
    }
  )

  const { data: mainData, isValidating, mutate } = useSWR(
    currentUserId
      ? ['/api/numbers', filterPlatform, filterLink, filterStatus, searchPhone, searchLabel, page, pageSize, currentUserId, isAdmin, isRoot]
      : null,
    async ([, fPlatform, fLink, fStatus, sPhone, sLabel, p, ps, uid, , root]: [
      string, Platform | 'all', string, 'all' | 'active' | 'inactive', string, string, number, number, string, boolean, boolean
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
        .order('short_link_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

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
      if (sLabel) {
        query = query.eq('label', sLabel)
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    start()
    try {
      const { error, count } = await supabase
        .from('whatsapp_numbers')
        .update({ is_active: !currentStatus }, { count: 'exact' })
        .eq('id', numberId)
      if (error) {
        showToast(`状态切换失败：${error.message}`, 'error')
        setError(`状态切换失败：${error.message}`)
      } else if ((count ?? 0) === 0) {
        showToast('状态切换失败：权限不足或号码不存在', 'error')
        setError('状态切换失败：权限不足或号码不存在')
      } else {
        mutate()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      showToast(`状态切换失败：${msg}`, 'error')
      setError(`状态切换失败：${msg}`)
    } finally {
      done()
    }
  }

  const handleDelete = async (numberId: string) => {
    if (!confirm('确定要删除此号码吗？')) return
    start()
    try {
      const { error, count } = await supabase
        .from('whatsapp_numbers')
        .delete({ count: 'exact' })
        .eq('id', numberId)
      if (error) {
        setError('删除失败：' + error.message)
        showToast('删除失败：' + error.message, 'error')
      } else if ((count ?? 0) === 0) {
        setError('删除失败：权限不足或号码不存在（可能受 RLS 策略限制）')
        showToast('删除失败：权限不足或号码不存在', 'error')
      } else {
        showToast('号码已删除', 'success')
        mutate()
      }
    } finally {
      done()
    }
  }

  const handleBulkToggle = async (activate: boolean) => {
    if (selected.size === 0) return
    const total = selected.size
    start()
    try {
      const { error, count } = await supabase
        .from('whatsapp_numbers')
        .update({ is_active: activate }, { count: 'exact' })
        .in('id', Array.from(selected))
      if (error) {
        showToast(`批量${activate ? '启用' : '停用'}失败：${error.message}`, 'error')
        setError(`批量${activate ? '启用' : '停用'}失败：${error.message}`)
        return
      }
      const actualUpdated = count ?? 0
      if (actualUpdated === 0) {
        showToast(`批量${activate ? '启用' : '停用'}失败：权限不足或号码不属于您`, 'error')
        setError(`批量${activate ? '启用' : '停用'}失败：权限不足或号码不属于您（RLS 策略限制）`)
        return
      }
      setSelected(new Set())
      if (actualUpdated < total) {
        showToast(`仅${activate ? '启用' : '停用'} ${actualUpdated}/${total} 个号码，其余可能因权限不足未操作`, 'info')
        setError(`仅${activate ? '启用' : '停用'} ${actualUpdated}/${total} 个号码。可能原因：号码不属于您 / RLS 策略限制`)
      } else {
        showToast(`已批量${activate ? '启用' : '停用'} ${actualUpdated} 个号码`, 'success')
      }
      mutate()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      showToast(`批量操作失败：${msg}`, 'error')
      setError(`批量操作失败：${msg}`)
    } finally {
      done()
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    const total = selected.size
    if (!confirm(`确定要删除选中的 ${total} 个号码吗？`)) return
    start()
    try {
      const { error, count } = await supabase
        .from('whatsapp_numbers')
        .delete({ count: 'exact' })
        .in('id', Array.from(selected))

      if (error) {
        showToast(`批量删除失败：${error.message}`, 'error')
        setError(`批量删除失败：${error.message}`)
        return
      }

      const actualDeleted = count ?? 0
      setSelected(new Set())

      if (actualDeleted < total) {
        showToast(`仅删除 ${actualDeleted}/${total} 个号码，其余可能因权限不足未删除`, 'info')
        setError(`仅删除 ${actualDeleted}/${total} 个号码。可能原因：号码不属于您 / RLS 策略限制 / 隐藏号码无权删除`)
      } else {
        showToast(`已删除 ${actualDeleted} 个号码`, 'success')
      }
      mutate()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      showToast(`批量删除失败：${msg}`, 'error')
      setError(`批量删除失败：${msg}`)
    } finally {
      done()
    }
  }

  const handleExport = (activeOnly: boolean) => {
    start()
    setShowExportMenu(false)
    try {
      const filtered = numbers.filter((n) => n.is_active === activeOnly)
      const content = filtered.map((n) => n.phone_number).join('\n')
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = activeOnly ? 'online_numbers.txt' : 'offline_numbers.txt'
      a.click()
      URL.revokeObjectURL(url)
      showToast('导出成功', 'success')
    } catch {
      showToast('导出失败', 'error')
    } finally {
      done()
    }
  }

  const handleAddNumbers = async () => {
    if (!modalLinkId) {
      setError('请选择关联链接')
      return
    }
    if (!modalLabel.trim()) {
      setError('请填写工单')
      return
    }
    const lines = modalNumbers.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      setError('请输入至少一个号码')
      return
    }
    setAdding(true)
    setError('')
    start()

    // ── Call API route per-number ──────────────────────────────────────────
    const errors: string[] = []
    let added = 0

    for (const phone of lines) {
      try {
        const res = await fetch(`/api/links/${modalLinkId}/numbers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone_number: phone,
            label: modalLabel.trim() || null,
            platform: modalPlatform,
            is_active: modalStatus === 'active',
          }),
        })
        if (res.ok) {
          added++
        } else {
          const err = await res.json().catch(() => ({}))
          errors.push(`${phone}: ${err.error || '添加失败'}`)
        }
      } catch {
        errors.push(`${phone}: 网络错误`)
      }
    }

    setAdding(false)
    done()
    if (errors.length > 0) {
      setError(`部分号码添加失败：${errors.slice(0, 3).join('；')}${errors.length > 3 ? '…' : ''}`)
      showToast(`${added} 个成功，${errors.length} 个失败`, 'error')
    } else {
      setSuccess(`成功添加 ${added} 个号码`)
      setTimeout(() => setSuccess(''), 3000)
      showToast(`成功添加 ${added} 个号码`, 'success')
      setModalLinkId('')
      setModalPlatform('whatsapp')
      setModalLabel('')
      setModalNumbers('')
      setModalStatus('active')
      setShowModal(false)
      mutate()
    }
  }

  const handleBulkDeleteFromModal = async () => {
    if (!bulkDeleteLinkId) {
      setError('请选择链接')
      return
    }
    const phones = bulkDeleteNumbers.split('\n').map((l) => l.trim()).filter(Boolean)
    if (phones.length === 0) {
      setError('请输入至少一个号码')
      return
    }
    setBulkDeleting(true)
    setError('')
    start()

    const { data, error: fetchError } = await supabase
      .from('whatsapp_numbers')
      .select('id, phone_number')
      .eq('short_link_id', bulkDeleteLinkId)
      .in('phone_number', phones)

    if (fetchError) {
      setError('查询失败：' + fetchError.message)
      showToast('查询失败：' + fetchError.message, 'error')
      setBulkDeleting(false)
      done()
      return
    }

    const foundPhones = new Set<string>()
    const ids: string[] = []
    for (const r of (data || [])) {
      foundPhones.add((r as { id: string; phone_number: string }).phone_number)
      ids.push((r as { id: string; phone_number: string }).id)
    }
    const notFoundPhones = phones.filter((p) => !foundPhones.has(p))
    const notFoundMsg = `以下 ${notFoundPhones.length} 个号码不存在（请检查是否拼写正确）：\n${notFoundPhones.join('，')}`

    if (ids.length === 0) {
      setError(notFoundMsg)
      showToast('未找到匹配的号码', 'error')
      setBulkDeleting(false)
      done()
      return
    }

    const { error: deleteError, count: deleteCount } = await supabase
      .from('whatsapp_numbers')
      .delete({ count: 'exact' })
      .in('id', ids)

    if (deleteError) {
      setError('删除失败：' + deleteError.message)
      showToast('删除失败：' + deleteError.message, 'error')
    } else {
      const actualDeleted = deleteCount ?? 0
      if (notFoundPhones.length > 0) {
        setError(notFoundMsg)
        showToast(`已删除 ${actualDeleted} 个号码，${notFoundPhones.length} 个号码不存在`, 'info')
        mutate()
      } else if (actualDeleted < ids.length) {
        setError(`仅删除 ${actualDeleted}/${ids.length} 个号码。可能原因：号码不属于您 / RLS 策略限制`)
        showToast(`仅删除 ${actualDeleted}/${ids.length} 个号码，其余可能因权限不足未删除`, 'info')
        mutate()
      } else {
        setSuccess(`成功删除 ${actualDeleted} 个号码`)
        setTimeout(() => setSuccess(''), 3000)
        showToast(`成功删除 ${actualDeleted} 个号码`, 'success')
        setShowBulkDeleteModal(false)
        setBulkDeleteLinkId('')
        setBulkDeleteNumbers('')
        mutate()
      }
    }
    setBulkDeleting(false)
    done()
  }

  const handleRefresh = async () => {
    start()
    try {
      await mutate()
    } catch {
      showToast('刷新失败', 'error')
    } finally {
      done()
    }
  }

  const handleOpenEdit = (num: NumberWithLink) => {
    setEditId(num.id)
    setEditPhone(num.phone_number)
    setEditLabel(num.label || '')
    setEditPlatform(getPlatform(num.platform))
    setEditStatus(num.is_active ? 'active' : 'inactive')
    setError('')
    setShowEditModal(true)
  }

  const handleEditNumber = async () => {
    if (!editLabel.trim()) {
      setError('请填写工单')
      return
    }
    setEditSaving(true)
    setError('')
    start()

    const { error: updateError, count: updateCount } = await supabase
      .from('whatsapp_numbers')
      .update({
        phone_number: editPhone,
        label: editLabel.trim(),
        platform: editPlatform,
        is_active: editStatus === 'active',
      }, { count: 'exact' })
      .eq('id', editId)

    if (updateError) {
      setError('修改失败：' + updateError.message)
      showToast('修改失败：' + updateError.message, 'error')
    } else if ((updateCount ?? 0) === 0) {
      setError('修改失败：权限不足或号码不存在（可能受 RLS 策略限制）')
      showToast('修改失败：权限不足或号码不存在', 'error')
    } else {
      setSuccess('修改成功')
      setTimeout(() => setSuccess(''), 3000)
      showToast('修改成功', 'success')
      setShowEditModal(false)
      mutate()
    }
    setEditSaving(false)
    done()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-700 border-b border-gray-200">
                {['', '链接', '工单', '号码', '号码类型', '访问次数', '状态', '操作'].map((h) => (
                  <th key={h} className="py-4 px-5 font-bold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="py-4 px-5">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: j === 0 ? '1rem' : `${60 + (j * 10) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📱 号码管理</h1>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            aria-label="刷新号码列表"
            className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            🔄 刷新
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ⬆️ 导出 ▾
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => handleExport(true)}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >
                  🟢 导出在线号码
                </button>
                <button
                  onClick={() => handleExport(false)}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
                >
                  🔴 导出离线号码
                </button>
              </div>
            )}
          </div>
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
          <WorkOrderSelect
            options={allLabels}
            value={searchLabel}
            onChange={(label) => { setSearchLabel(label); setPage(1) }}
          />
        </div>
      </div>

      {/* Bulk Actions + Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && (
            <span className="text-sm text-gray-600">已选 {selected.size} 个</span>
          )}
          <button
            onClick={() => handleBulkToggle(true)}
            className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
          >
            启用
          </button>
          <button
            onClick={() => handleBulkToggle(false)}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            停用
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
          >
            删除
          </button>
          <button
            onClick={() => {
              setError('')
              if (selected.size > 0) {
                const selectedPhones = numbers
                  .filter((n) => selected.has(n.id))
                  .map((n) => n.phone_number)
                setBulkDeleteNumbers(selectedPhones.join('\n'))
              } else {
                setBulkDeleteNumbers('')
              }
              setShowBulkDeleteModal(true)
            }}
            className="px-3 py-1.5 text-xs bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors"
          >
            批量删除
          </button>
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
              <tr className="text-left text-gray-700 border-b border-gray-200">
                <th className="py-4 px-5">
                  <input
                    type="checkbox"
                    checked={numbers.length > 0 && selected.size === numbers.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="py-4 px-5 font-bold text-gray-700">链接</th>
                <th className="py-4 px-5 font-bold text-gray-700">工单</th>
                <th className="py-4 px-5 font-bold text-gray-700">号码</th>
                <th className="py-4 px-5 font-bold text-gray-700">号码类型</th>
                <th className="py-4 px-5 font-bold text-gray-700">访问次数</th>
                <th className="py-4 px-5 font-bold text-gray-700">状态</th>
                <th className="py-4 px-5 font-bold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {numbers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    暂无号码数据
                  </td>
                </tr>
              ) : (
                numbers.map((num) => (
                  <tr key={num.id} className="hover:bg-gray-50">
                    <td className="py-4 px-5">
                      <input
                        type="checkbox"
                        checked={selected.has(num.id)}
                        onChange={() => toggleSelect(num.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="py-4 px-5 text-gray-800 font-medium">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {num.short_links?.slug || '-'}
                      </span>
                      {num.short_links?.title && (
                        <span className="text-gray-400 ml-1 text-xs">({num.short_links.title})</span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-gray-800 text-sm font-medium">
                      {num.label}
                    </td>
                    <td className="py-4 px-5 text-gray-800 font-medium">
                      <span className="font-medium">{num.phone_number}</span>
                    </td>
                    <td className="py-4 px-5">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${PLATFORM_COLORS[getPlatform(num.platform)]}`}>
                        {PLATFORM_LABELS[getPlatform(num.platform)]}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-gray-800 font-medium">{num.click_count}</td>
                    <td className="py-4 px-5">
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
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleOpenEdit(num)}
                          className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          修改
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  工单 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalLabel}
                  onChange={(e) => setModalLabel(e.target.value)}
                  placeholder="请输入工单号"
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

      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">批量删除号码</h2>
              <button
                onClick={() => { setShowBulkDeleteModal(false); setBulkDeleteLinkId(''); setBulkDeleteNumbers('') }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择链接 <span className="text-red-500">*</span>
                </label>
                <LinkSelect
                  options={links}
                  value={bulkDeleteLinkId}
                  onChange={setBulkDeleteLinkId}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  号码 <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">（一行一个）</span>
                </label>
                <textarea
                  value={bulkDeleteNumbers}
                  onChange={(e) => setBulkDeleteNumbers(e.target.value)}
                  rows={6}
                  placeholder={'8613800138000\n8613900139000\n...'}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none font-mono"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowBulkDeleteModal(false); setBulkDeleteLinkId(''); setBulkDeleteNumbers('') }}
                  className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleBulkDeleteFromModal}
                  disabled={bulkDeleting}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {bulkDeleting ? '删除中...' : '确定'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">修改号码</h2>
              <button
                onClick={() => setShowEditModal(false)}
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
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value as Platform)}
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
                  工单 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="请输入工单号"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  号码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="请输入号码"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editStatus"
                      value="active"
                      checked={editStatus === 'active'}
                      onChange={() => setEditStatus('active')}
                      className="text-green-500"
                    />
                    <span className="text-sm text-gray-700">正常</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editStatus"
                      value="inactive"
                      checked={editStatus === 'inactive'}
                      onChange={() => setEditStatus('inactive')}
                      className="text-green-500"
                    />
                    <span className="text-sm text-gray-700">停用</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleEditNumber}
                  disabled={editSaving}
                  className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {editSaving ? '保存中...' : '确定'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
