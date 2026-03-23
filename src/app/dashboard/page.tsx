'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'
import { generateSlug, getBaseUrl } from '@/lib/utils'
import type { ShortLink } from '@/types'
import Link from 'next/link'
import Pagination from '@/components/ui/Pagination'

interface ShortLinkOption {
  id: string
  slug: string
  title: string | null
}

/** Searchable dropdown for selecting a short link filter. */
function ShortLinkSelect({
  options,
  value,
  onChange,
}: {
  options: ShortLinkOption[]
  value: string
  onChange: (slug: string) => void
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

  const filtered = options.filter((o) => {
    const q = search.toLowerCase()
    return (
      o.slug.toLowerCase().includes(q) ||
      (o.title && o.title.toLowerCase().includes(q))
    )
  })

  const selectedOption = options.find((o) => o.slug === value)
  const displayLabel = selectedOption
    ? `${selectedOption.title ? `${selectedOption.title} · ` : ''}${selectedOption.slug}`
    : '搜索链接 URL 或标题...'

  return (
    <div ref={ref} className="relative flex-1 min-w-48">
      <button
        type="button"
        onClick={() => { setOpen((prev) => !prev); setSearch('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{displayLabel}</span>
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
              placeholder="搜索短链..."
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
                全部短链
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.slug); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${value === o.slug ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
                  >
                    <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded mr-1.5">{o.slug}</span>
                    {o.title && <span className="text-gray-500">{o.title}</span>}
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

export default function DashboardPage() {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [allLinks, setAllLinks] = useState<ShortLinkOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchSlug, setSearchSlug] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [success, setSuccess] = useState('')
  const [copyToast, setCopyToast] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('agent')
  const [userExpiresAt, setUserExpiresAt] = useState<string | null>(null)

  // Create modal state
  const [showModal, setShowModal] = useState(false)
  const [newSlug, setNewSlug] = useState(generateSlug())
  const [newDescription, setNewDescription] = useState('')
  const [newTiktokPixelEnabled, setNewTiktokPixelEnabled] = useState(false)
  const [newTiktokPixelId, setNewTiktokPixelId] = useState('')
  const [newTiktokEventType, setNewTiktokEventType] = useState<'SubmitForm' | 'CompletePayment' | 'ClickButton'>('SubmitForm')
  const [newFbPixelEnabled, setNewFbPixelEnabled] = useState(false)
  const [newFbPixelId, setNewFbPixelId] = useState('')
  const [newFbEventType, setNewFbEventType] = useState<'Lead' | 'Purchase' | 'ViewContent'>('Lead')
  const [newAutoReplyEnabled, setNewAutoReplyEnabled] = useState(false)
  const [newAutoReplyMessages, setNewAutoReplyMessages] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id)
        const { data: prof } = await supabase
          .from('profiles')
          .select('role, expires_at')
          .eq('id', user.id)
          .single()
        if (prof?.role) setUserRole(prof.role)
        setUserExpiresAt(prof?.expires_at ?? null)
      }
    })
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    supabase
      .from('short_links')
      .select('id, slug, title')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAllLinks(data as ShortLinkOption[])
      })
  }, [currentUserId])

  const fetchLinks = useCallback(async () => {
    if (!currentUserId) return
    setLoading(true)
    try {
      let query = supabase
        .from('short_links')
        .select('*', { count: 'exact' })
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })

      if (searchSlug) {
        query = query.eq('slug', searchSlug)
      }
      if (filterStatus === 'active') {
        query = query.eq('is_active', true)
      } else if (filterStatus === 'inactive') {
        query = query.eq('is_active', false)
      }

      const from = (page - 1) * pageSize
      query = query.range(from, from + pageSize - 1)

      const { data, count, error } = await query
      if (error) throw error
      setLinks(data || [])
      setTotalCount(count || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchSlug, filterStatus, currentUserId])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === links.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(links.map((l) => l.id)))
    }
  }

  const handleDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`确定要删除选中的 ${selected.size} 个短链吗？此操作不可撤销。`)) return
    await supabase.from('short_links').delete().in('id', Array.from(selected))
    setSelected(new Set())
    fetchLinks()
  }

  const handleCopyLink = (slug: string) => {
    const url = `${getBaseUrl()}/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopyToast('✅ 链接已复制')
      setTimeout(() => setCopyToast(''), 2500)
    })
  }

  const handleToggleStatus = async () => {
    if (selected.size === 0) return
    const firstId = Array.from(selected)[0]
    const firstLink = links.find((l) => l.id === firstId)
    const newStatus = !firstLink?.is_active
    await supabase.from('short_links').update({ is_active: newStatus }).in('id', Array.from(selected))
    setSelected(new Set())
    fetchLinks()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')

    if (!newSlug.trim()) {
      setCreateError('请输入短链后缀')
      return
    }

    if (newTiktokPixelEnabled && !newTiktokPixelId.trim()) {
      setCreateError('请输入 TikTok Pixel ID')
      return
    }

    if (newFbPixelEnabled && !newFbPixelId.trim()) {
      setCreateError('请输入 Facebook Pixel ID')
      return
    }

    setCreating(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { error: linkError } = await supabase
        .from('short_links')
        .insert({
          slug: newSlug.trim(),
          title: null,
          description: newDescription.trim() || null,
          user_id: user.id,
          tiktok_pixel_enabled: newTiktokPixelEnabled,
          tiktok_pixel_id: newTiktokPixelEnabled ? newTiktokPixelId.trim() : null,
          tiktok_access_token: null,
          tiktok_event_type: newTiktokPixelEnabled ? newTiktokEventType : null,
          fb_pixel_enabled: newFbPixelEnabled,
          fb_pixel_id: newFbPixelEnabled ? newFbPixelId.trim() : null,
          fb_event_type: newFbPixelEnabled ? newFbEventType : null,
          auto_reply_enabled: newAutoReplyEnabled,
          auto_reply_messages: newAutoReplyEnabled && newAutoReplyMessages.trim() ? newAutoReplyMessages.trim() : null,
        })

      if (linkError) {
        if (linkError.message.includes('duplicate') || linkError.code === '23505') {
          setCreateError('该短链后缀已被使用，请换一个')
        } else {
          setCreateError('创建失败：' + linkError.message)
        }
        setCreating(false)
        return
      }

      setShowModal(false)
      setNewSlug(generateSlug())
      setNewDescription('')
      setNewTiktokPixelEnabled(false)
      setNewTiktokPixelId('')
      setNewTiktokEventType('SubmitForm')
      setNewFbPixelEnabled(false)
      setNewFbPixelId('')
      setNewFbEventType('Lead')
      setNewAutoReplyEnabled(false)
      setNewAutoReplyMessages('')
      setSuccess('短链创建成功')
      setTimeout(() => setSuccess(''), 3000)
      fetchLinks()
    } catch {
      setCreateError('操作失败，请重试')
    } finally {
      setCreating(false)
    }
  }

  const isExpiredAgent = userRole === 'agent' && (!userExpiresAt || new Date(userExpiresAt) < new Date())
  const isCreateBlocked = userRole === 'guest' || isExpiredAgent
  const createButtonTitle = userRole === 'guest'
    ? '游客账号无法创建短链'
    : isExpiredAgent
      ? '您的账号已到期或未分配使用时间，请联系管理员续费'
      : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">短链管理</h1>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">{success}</div>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-green-200 text-green-700 px-5 py-2.5 rounded-lg shadow-lg text-sm font-medium">
          {copyToast}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-3 items-center">
          <ShortLinkSelect
            options={allLinks}
            value={searchSlug}
            onChange={(slug) => { setSearchSlug(slug); setPage(1) }}
          />
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as 'all' | 'active' | 'inactive'); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="inactive">关闭</option>
          </select>
          <button
            onClick={() => { setSearchSlug(''); setFilterStatus('all'); setPage(1) }}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            重置
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setNewSlug(generateSlug()); setCreateError(''); setShowModal(true) }}
          disabled={isCreateBlocked}
          title={createButtonTitle}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          新增
        </button>
        <button
          onClick={() => {
            if (selected.size !== 1) return
            window.location.href = `/dashboard/${Array.from(selected)[0]}`
          }}
          disabled={selected.size !== 1}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          修改
        </button>
        <button
          onClick={handleDelete}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          删除
        </button>
        <button
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          导出
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={links.length > 0 && selected.size === links.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="py-3 px-4 font-medium">序号</th>
                  <th className="py-3 px-4 font-medium">链接 URL</th>
                  <th className="py-3 px-4 font-medium">链接描述</th>
                  <th className="py-3 px-4 font-medium">回复语</th>
                  <th className="py-3 px-4 font-medium">状态</th>
                  <th className="py-3 px-4 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {links.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      暂无短链，点击 新增 创建第一个
                    </td>
                  </tr>
                ) : (
                  links.map((link, index) => (
                    <tr key={link.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selected.has(link.id)}
                          onChange={() => toggleSelect(link.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(link.slug)}
                          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors group"
                          title="点击复制链接"
                        >
                          <svg className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm font-mono">{link.slug}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-gray-700 text-sm">{link.description || '-'}</td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {link.auto_reply_enabled && link.auto_reply_messages
                          ? <span className="truncate max-w-[120px] block">{link.auto_reply_messages.split('\n')[0]}</span>
                          : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${link.is_active ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-gray-100 text-gray-500'}`}>
                          {link.is_active ? '正常' : '关闭'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/${link.id}`}
                            className="text-xs text-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-0.5"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            修改
                          </Link>
                          <button
                            onClick={async () => {
                              if (!confirm('确定要删除此短链吗？')) return
                              await supabase.from('short_links').delete().eq('id', link.id)
                              fetchLinks()
                            }}
                            className="text-xs text-red-500 hover:text-red-700 transition-colors inline-flex items-center gap-0.5"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
        )}

        {/* Pagination */}
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        />
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">新增短链</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  链接描述 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    required
                    placeholder="custom-slug"
                    pattern="[a-zA-Z0-9\-_]+"
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setNewSlug(generateSlug())}
                    className="px-3 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                  >
                    随机
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">只能包含字母、数字、横线和下划线</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  链接描述 <span className="text-gray-400 font-normal ml-1">（选填）</span>
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  placeholder="备注信息..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm resize-none"
                />
              </div>

              {/* TikTok Pixel */}
              <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-indigo-900 text-sm">🎯 TikTok Pixel</p>
                  <button
                    type="button"
                    onClick={() => setNewTiktokPixelEnabled(!newTiktokPixelEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      newTiktokPixelEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      newTiktokPixelEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                {newTiktokPixelEnabled && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-indigo-800 mb-1">Pixel ID <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={newTiktokPixelId}
                        onChange={(e) => setNewTiktokPixelId(e.target.value)}
                        placeholder="例如：CXXXXXXXXXX"
                        className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none bg-white text-sm"
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
                            onClick={() => setNewTiktokEventType(opt.value)}
                            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                              newTiktokEventType === opt.value
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
                  <p className="font-medium text-blue-900 text-sm">📘 Facebook Pixel</p>
                  <button
                    type="button"
                    onClick={() => setNewFbPixelEnabled(!newFbPixelEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      newFbPixelEnabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      newFbPixelEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                {newFbPixelEnabled && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-blue-800 mb-1">Pixel ID <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={newFbPixelId}
                        onChange={(e) => setNewFbPixelId(e.target.value)}
                        placeholder="例如：123456789012345"
                        className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white text-sm"
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
                            onClick={() => setNewFbEventType(opt.value)}
                            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                              newFbEventType === opt.value
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
                  <p className="font-medium text-yellow-900 text-sm">💬 自动回复语</p>
                  <button
                    type="button"
                    onClick={() => setNewAutoReplyEnabled(!newAutoReplyEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      newAutoReplyEnabled ? 'bg-yellow-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      newAutoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                {newAutoReplyEnabled && (
                  <div>
                    <label className="block text-xs font-medium text-yellow-800 mb-1">回复语句（一行一个）</label>
                    <textarea
                      value={newAutoReplyMessages}
                      onChange={(e) => setNewAutoReplyMessages(e.target.value)}
                      rows={3}
                      placeholder={'你好\n早上好\n下午好'}
                      className="w-full px-3 py-2 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none bg-white text-sm resize-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {creating ? '创建中...' : '确定'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
