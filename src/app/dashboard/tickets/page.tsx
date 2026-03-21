'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { WorkOrder, TicketType, Platform } from '@/types'

const TICKET_TYPE_OPTIONS: TicketType[] = [
  '云控',
  '海王SCRM',
  '太极云控',
  '火箭云控',
  'SaleSmartly-Channel',
  'Salesmartly-Customer',
  '译发发SCRM',
]

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  expired: '已过期',
  cancelled: '已取消',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
}

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'line', label: 'LINE' },
  { value: 'custom', label: '自定义' },
]

export default function WorkOrdersPage() {
  const router = useRouter()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create modal state
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [modalTicketType, setModalTicketType] = useState<TicketType>('云控')
  const [modalTicketName, setModalTicketName] = useState('')
  const [modalTicketLink, setModalTicketLink] = useState('')
  const [modalDistributionSlug, setModalDistributionSlug] = useState('')
  const [modalNumberType, setModalNumberType] = useState<Platform>('whatsapp')
  const [modalStartTime, setModalStartTime] = useState('')
  const [modalEndTime, setModalEndTime] = useState('')
  const [modalTotalQty, setModalTotalQty] = useState('')
  const [modalDownloadRatio, setModalDownloadRatio] = useState('')
  const [modalAccount, setModalAccount] = useState('')
  const [modalPassword, setModalPassword] = useState('')

  // Sync state
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const res = await fetch('/api/work-orders')
    if (res.ok) {
      const data = await res.json()
      setWorkOrders(data)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleStatus = async (e: React.MouseEvent, order: WorkOrder) => {
    e.stopPropagation()
    const newStatus = order.status === 'active' ? 'cancelled' : 'active'
    const res = await fetch(`/api/work-orders/${order.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setWorkOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
      )

      if (order.distribution_link_slug) {
        try {
          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()

          if (linkData) {
            await supabase
              .from('whatsapp_numbers')
              .update({ is_active: newStatus === 'active' })
              .eq('short_link_id', linkData.id)
              .eq('label', order.ticket_name)
          }
        } catch (err) {
          console.error('[handleToggleStatus] Failed to update numbers for slug', order.distribution_link_slug, err)
        }
      }
    }
  }

  const handleDelete = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation()
    if (!confirm('确定要删除此工单吗？此操作不可撤销。')) return
    const res = await fetch(`/api/work-orders/${orderId}`, { method: 'DELETE' })
    if (res.ok) {
      setWorkOrders((prev) => prev.filter((o) => o.id !== orderId))
      setSuccess('工单已删除')
      setTimeout(() => setSuccess(''), 3000)
    }
  }

  const handleSync = async (e: React.MouseEvent, order: WorkOrder) => {
    e.stopPropagation()
    if (!order.ticket_link) return
    setSyncingId(order.id)
    try {
      const res = await fetch('/api/sync/yunkon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_link: order.ticket_link }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        const { data } = json
        const updateRes = await fetch(`/api/work-orders/${order.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sync_total_sum: data.total_sum,
            sync_total_day_sum: data.total_day_sum,
            sync_total_numbers: data.total_count,
            sync_online_count: data.online_count,
            sync_offline_count: data.offline_count,
            sync_numbers: data.numbers,
            last_synced_at: new Date().toISOString(),
          }),
        })
        if (updateRes.ok) {
          const updated = await updateRes.json()
          setWorkOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)))
          setSuccess('同步成功')
          setTimeout(() => setSuccess(''), 3000)
        }
      } else {
        setError('同步失败：' + (json.error || '未知错误'))
        setTimeout(() => setError(''), 5000)
      }
    } catch (err) {
      console.error('[handleSync]', err)
      setError('同步请求失败')
      setTimeout(() => setError(''), 5000)
    } finally {
      setSyncingId(null)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalTicketName.trim() || !modalTicketLink.trim() || !modalDistributionSlug.trim() || !modalStartTime || !modalEndTime) {
      setError('请填写所有必填字段')
      return
    }
    setCreating(true)
    const res = await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_type: modalTicketType,
        ticket_name: modalTicketName.trim(),
        ticket_link: modalTicketLink.trim(),
        distribution_link_slug: modalDistributionSlug.trim(),
        number_type: modalNumberType,
        start_time: modalStartTime,
        end_time: modalEndTime,
        total_quantity: modalTotalQty ? Number(modalTotalQty) : 0,
        download_ratio: modalDownloadRatio ? Number(modalDownloadRatio) : 0,
        account: modalAccount.trim() || null,
        password: modalPassword.trim() || null,
      }),
    })
    if (res.ok) {
      const created = await res.json()
      setWorkOrders((prev) => [created, ...prev])
      setSuccess('工单创建成功')
      setTimeout(() => setSuccess(''), 3000)
      setShowModal(false)
      setModalTicketName('')
      setModalTicketLink('')
      setModalDistributionSlug('')
      setModalStartTime('')
      setModalEndTime('')
      setModalTotalQty('')
      setModalDownloadRatio('')
      setModalAccount('')
      setModalPassword('')
    } else {
      const json = await res.json()
      setError('创建失败：' + (json.error || '未知错误'))
      setTimeout(() => setError(''), 5000)
    }
    setCreating(false)
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
        <h1 className="text-2xl font-bold text-gray-900">工单管理</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + 新建工单
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

      {workOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <p className="text-gray-400 text-sm">暂无工单，点击"新建工单"创建第一个工单</p>
        </div>
      ) : (
        <div className="space-y-4">
          {workOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-gray-900">{order.ticket_name}</h2>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                        {order.ticket_type}
                      </span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-medium">
                        {order.number_type}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                      <span>分发链接：{order.distribution_link_slug}</span>
                      <span>开始：{formatDate(order.start_time)}</span>
                      <span>结束：{formatDate(order.end_time)}</span>
                      {order.total_quantity > 0 && <span>总量：{order.total_quantity}</span>}
                      {order.download_ratio > 0 && <span>下载比例：{order.download_ratio}%</span>}
                    </div>
                    {(order.sync_total_numbers !== undefined && order.sync_total_numbers !== null) && (
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                        <span>设备总数：{order.sync_total_numbers}</span>
                        <span className="text-green-600">在线：{order.sync_online_count ?? 0}</span>
                        <span className="text-red-500">离线：{order.sync_offline_count ?? 0}</span>
                        <span>累计：{order.sync_total_sum ?? 0}</span>
                        <span>今日：{order.sync_total_day_sum ?? 0}</span>
                        {order.last_synced_at && <span>上次同步：{formatDate(order.last_synced_at)}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {order.ticket_link && (
                      <button
                        onClick={(e) => handleSync(e, order)}
                        disabled={syncingId === order.id}
                        className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors font-medium"
                      >
                        {syncingId === order.id ? '同步中...' : '同步'}
                      </button>
                    )}
                    {(order.status === 'active' || order.status === 'cancelled') && (
                      <button
                        onClick={(e) => handleToggleStatus(e, order)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors font-medium ${
                          order.status === 'active'
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {order.status === 'active' ? '取消工单' : '重新启用'}
                      </button>
                    )}
                    {order.sync_numbers && order.sync_numbers.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedId(expandedId === order.id ? null : order.id)
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                      >
                        {expandedId === order.id ? '收起' : '查看设备'}
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, order.id)}
                      className="px-3 py-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>

              {expandedId === order.id && order.sync_numbers && order.sync_numbers.length > 0 && (
                <div className="border-t border-gray-100 px-5 pb-4">
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-100">
                          <th className="py-2 px-3 text-left font-medium">昵称</th>
                          <th className="py-2 px-3 text-left font-medium">账号</th>
                          <th className="py-2 px-3 text-center font-medium">状态</th>
                          <th className="py-2 px-3 text-right font-medium">累计</th>
                          <th className="py-2 px-3 text-right font-medium">今日</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {order.sync_numbers.map((num) => (
                          <tr key={num.id} className="hover:bg-gray-50">
                            <td className="py-2 px-3 text-gray-800">{num.nickname}</td>
                            <td className="py-2 px-3 text-gray-500">{num.user}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${num.online === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {num.online === 1 ? '在线' : '离线'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-gray-700">{num.sum}</td>
                            <td className="py-2 px-3 text-right text-gray-700">{num.day_sum}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Work Order Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">新建工单</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    工单类型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={modalTicketType}
                    onChange={(e) => setModalTicketType(e.target.value as TicketType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white text-sm"
                  >
                    {TICKET_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    工单名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={modalTicketName}
                    onChange={(e) => setModalTicketName(e.target.value)}
                    required
                    placeholder="唯一标识名称，用于匹配号码 label"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    工单链接 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={modalTicketLink}
                    onChange={(e) => setModalTicketLink(e.target.value)}
                    required
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    分发链接 Slug <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={modalDistributionSlug}
                    onChange={(e) => setModalDistributionSlug(e.target.value)}
                    required
                    placeholder="例如：abc123"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">号码类型</label>
                  <select
                    value={modalNumberType}
                    onChange={(e) => setModalNumberType(e.target.value as Platform)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white text-sm"
                  >
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      开始时间 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={modalStartTime}
                      onChange={(e) => setModalStartTime(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      结束时间 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={modalEndTime}
                      onChange={(e) => setModalEndTime(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">总量</label>
                    <input
                      type="number"
                      value={modalTotalQty}
                      onChange={(e) => setModalTotalQty(e.target.value)}
                      min="0"
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">下载比例 (%)</label>
                    <input
                      type="number"
                      value={modalDownloadRatio}
                      onChange={(e) => setModalDownloadRatio(e.target.value)}
                      min="0"
                      max="100"
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">账号</label>
                    <input
                      type="text"
                      value={modalAccount}
                      onChange={(e) => setModalAccount(e.target.value)}
                      placeholder="可选"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                    <input
                      type="text"
                      value={modalPassword}
                      onChange={(e) => setModalPassword(e.target.value)}
                      placeholder="可选"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
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
                    {creating ? '创建中...' : '创建工单'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
