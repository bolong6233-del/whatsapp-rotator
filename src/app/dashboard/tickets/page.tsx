'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
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

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })

    setTickets(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  const filtered = filterStatus === 'all'
    ? tickets
    : tickets.filter((t) => t.status === filterStatus)

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
        <Link
          href="/dashboard/tickets/create"
          className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
        >
          ➕ 创建工单
        </Link>
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
            <Link
              href="/dashboard/tickets/create"
              className="mt-4 inline-block px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
            >
              创建第一个工单
            </Link>
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
    </div>
  )
}
