'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { Ticket, TicketMessage } from '@/types'

const STATUS_OPTIONS = [
  { value: 'open', label: '待处理' },
  { value: 'in_progress', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

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

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: ticketData } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!ticketData) {
      router.push('/dashboard/tickets')
      return
    }

    setTicket(ticketData)

    const { data: messagesData } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    setMessages(messagesData || [])
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return
    setSending(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: id,
      user_id: user.id,
      message: newMessage.trim(),
      is_admin: false,
    })

    if (error) {
      setError('发送失败：' + error.message)
    } else {
      setNewMessage('')
      fetchData()
    }
    setSending(false)
  }

  const handleStatusChange = async (status: string) => {
    setUpdatingStatus(true)
    const { error } = await supabase
      .from('tickets')
      .update({ status })
      .eq('id', id)

    if (error) {
      setError('更新状态失败：' + error.message)
    } else {
      fetchData()
    }
    setUpdatingStatus(false)
  }

  const handleDelete = async () => {
    if (!confirm('确定要删除此工单吗？此操作不可撤销。')) return
    await supabase.from('tickets').delete().eq('id', id)
    router.push('/dashboard/tickets')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!ticket) return null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/tickets" className="text-gray-400 hover:text-gray-600 transition-colors">
            ← 返回
          </Link>
          <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[ticket.status]}`}>
            {STATUS_OPTIONS.find((s) => s.value === ticket.status)?.label}
          </span>
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
            {PRIORITY_LABELS[ticket.priority]}优先级
          </span>
        </div>
        <button
          onClick={handleDelete}
          className="text-red-400 hover:text-red-600 text-sm transition-colors"
        >
          删除工单
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">创建时间</p>
          <p className="text-sm font-medium text-gray-700">{formatDate(ticket.created_at)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">更新时间</p>
          <p className="text-sm font-medium text-gray-700">{formatDate(ticket.updated_at)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">消息数量</p>
          <p className="text-sm font-medium text-gray-700">{messages.length} 条</p>
        </div>
      </div>

      {/* Status Update */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-3">更新状态</h2>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              disabled={updatingStatus || ticket.status === opt.value}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                ticket.status === opt.value
                  ? STATUS_COLORS[opt.value] + ' ring-2 ring-offset-1 ring-current'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      {ticket.description && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-3">工单描述</h2>
          <p className="text-gray-600 whitespace-pre-wrap text-sm">{ticket.description}</p>
        </div>
      )}

      {/* Messages */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">消息记录</h2>
        </div>
        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">暂无消息，发送第一条消息开始沟通</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.is_admin ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[70%] rounded-xl px-4 py-3 text-sm ${
                    msg.is_admin
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-green-500 text-white'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.message}</p>
                  <p className={`text-xs mt-1 ${msg.is_admin ? 'text-gray-400' : 'text-green-100'}`}>
                    {msg.is_admin ? '客服' : '我'} · {formatDate(msg.created_at)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-5 border-t border-gray-100">
          <div className="flex gap-3">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              rows={3}
              placeholder="输入消息（Enter 发送，Shift+Enter 换行）"
              disabled={ticket.status === 'closed'}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none text-sm disabled:bg-gray-50 disabled:text-gray-400"
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !newMessage.trim() || ticket.status === 'closed'}
              className="px-5 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm transition-colors self-end"
            >
              {sending ? '发送中...' : '发送'}
            </button>
          </div>
          {ticket.status === 'closed' && (
            <p className="text-xs text-gray-400 mt-2">工单已关闭，无法发送消息</p>
          )}
        </div>
      </div>
    </div>
  )
}
