'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { Ticket } from '@/types'

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: '待处理' },
  { value: 'in_progress', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

const STATUS_LABELS: Record<string, string> = {
  open: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: '低优先级' },
  { value: 'medium', label: '中优先级' },
  { value: 'high', label: '高优先级' },
  { value: 'urgent', label: '紧急' },
]

export default function TicketsPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const handleOpenModal = () => {
    setCreateError('')
    setShowModal(true)
  }

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setTickets(data || [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  const filtered = filterStatus === 'all'
    ? tickets
    : tickets.filter((t) => t.status === filterStatus)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')

    if (!newTitle.trim()) {
      setCreateError('请输入工单标题')
      return
    }

    setCreating(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { error } = await supabase
        .from('tickets')
        .insert({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          priority: newPriority,
          user_id: user.id,
        })

      if (error) {
        setCreateError('创建失败：' + error.message)
        return
      }

      setShowModal(false)
      setNewTitle('')
      setNewDescription('')
      setNewPriority('medium')
      fetchTickets()
    } catch {
      setCreateError('操作失败，请重试')
    } finally {
      setCreating(false)
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
        <h1 className="text-2xl font-bold text-gray-900">🎫 工单管理</h1>
        <button
          onClick={handleOpenModal}
          className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
        >
          + 新增
        </button>
      </div>

      {/* Status Filter */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === opt.value
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
              {opt.value !== 'all' && (
                <span className="ml-1.5 text-xs opacity-75">
                  ({tickets.filter((t) => t.status === opt.value).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <p className="text-gray-400 text-4xl mb-3">🎫</p>
            <p className="text-gray-500">暂无工单</p>
            <button
              onClick={handleOpenModal}
              className="mt-4 inline-block px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
            >
              + 新增工单
            </button>
          </div>
        ) : (
          filtered.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/dashboard/tickets/${ticket.id}`}
              className="block bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-green-200 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[ticket.status]}`}>
                      {STATUS_LABELS[ticket.status]}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                      {PRIORITY_LABELS[ticket.priority]}优先级
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 truncate">{ticket.title}</h3>
                  {ticket.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">{ticket.description}</p>
                  )}
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <p className="text-xs text-gray-400">{formatDate(ticket.created_at)}</p>
                  <p className="text-green-600 text-sm mt-1">查看详情 →</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">新增工单</h2>
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
                  工单标题 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="简要描述问题或需求"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white text-sm"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">详细描述</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                  placeholder="详细描述您的问题或需求..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none text-sm"
                />
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
