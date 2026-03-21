'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'
import { generateSlug, getBaseUrl } from '@/lib/utils'
import type { ShortLink } from '@/types'
import Link from 'next/link'
import Pagination from '@/components/ui/Pagination'

export default function DashboardPage() {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchSlug, setSearchSlug] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [success, setSuccess] = useState('')

  // Create modal state
  const [showModal, setShowModal] = useState(false)
  const [newSlug, setNewSlug] = useState(generateSlug())
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTiktokPixelEnabled, setNewTiktokPixelEnabled] = useState(false)
  const [newTiktokPixelId, setNewTiktokPixelId] = useState('')
  const [newTiktokAccessToken, setNewTiktokAccessToken] = useState('')
  const [newAutoReplyEnabled, setNewAutoReplyEnabled] = useState(false)
  const [newAutoReplyMessages, setNewAutoReplyMessages] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('short_links')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (searchSlug) {
        query = query.or(`slug.ilike.%${searchSlug}%,title.ilike.%${searchSlug}%`)
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
  }, [page, pageSize, searchSlug, filterStatus])

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
          title: newTitle.trim() || null,
          description: newDescription.trim() || null,
          user_id: user.id,
          tiktok_pixel_enabled: newTiktokPixelEnabled,
          tiktok_pixel_id: newTiktokPixelEnabled ? newTiktokPixelId.trim() : null,
          tiktok_access_token: newTiktokPixelEnabled && newTiktokAccessToken.trim() ? newTiktokAccessToken.trim() : null,
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
      setNewTitle('')
      setNewDescription('')
      setNewTiktokPixelEnabled(false)
      setNewTiktokPixelId('')
      setNewTiktokAccessToken('')
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">短链管理</h1>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">{success}</div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            value={searchSlug}
            onChange={(e) => { setSearchSlug(e.target.value); setPage(1) }}
            placeholder="搜索链接 URL 或标题..."
            className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
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
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setNewSlug(generateSlug()); setCreateError(''); setShowModal(true) }}
          className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
        >
          + 新增
        </button>
        {selected.size > 0 && (
          <>
            <Link
              href={selected.size === 1 ? `/dashboard/${Array.from(selected)[0]}` : '#'}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              修改
            </Link>
            <button
              onClick={handleToggleStatus}
              className="px-4 py-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors"
            >
              切换状态
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              删除
            </button>
          </>
        )}
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
                  <th className="py-3 px-4 font-medium">链接 ID (Slug)</th>
                  <th className="py-3 px-4 font-medium">链接 URL</th>
                  <th className="py-3 px-4 font-medium">标题</th>
                  <th className="py-3 px-4 font-medium">点击量</th>
                  <th className="py-3 px-4 font-medium">状态</th>
                  <th className="py-3 px-4 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {links.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      暂无短链，点击 + 新增 创建第一个
                    </td>
                  </tr>
                ) : (
                  links.map((link) => (
                    <tr key={link.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selected.has(link.id)}
                          onChange={() => toggleSelect(link.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                          {link.slug}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <a
                          href={`${getBaseUrl()}/${link.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-800 text-xs font-mono truncate max-w-xs block"
                        >
                          {getBaseUrl().replace(/^https?:\/\//, '')}/{link.slug}
                        </a>
                      </td>
                      <td className="py-3 px-4 text-gray-700">{link.title || '-'}</td>
                      <td className="py-3 px-4 text-gray-600">{link.total_clicks}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${link.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {link.is_active ? '正常' : '关闭'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/dashboard/${link.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          管理
                        </Link>
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
                  短链后缀 <span className="text-red-500">*</span>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：双十一活动推广"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注说明</label>
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
                      <label className="block text-xs font-medium text-indigo-800 mb-1">Access Token</label>
                      <input
                        type="text"
                        value={newTiktokAccessToken}
                        onChange={(e) => setNewTiktokAccessToken(e.target.value)}
                        placeholder="可选，用于服务端事件上报"
                        className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none bg-white text-sm"
                      />
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
