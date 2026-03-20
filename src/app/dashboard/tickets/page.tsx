'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { WorkOrder, TicketType, Platform, SyncNumber } from '@/types'

const TICKET_TYPES: TicketType[] = [
  '云控',
  '海王SCRM',
  '太极云控',
  '火箭云控',
  'SaleSmartly-Channel',
  'Salesmartly-Customer',
  '译发发SCRM',
]

const NUMBER_TYPES: { value: Platform; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'line', label: 'Line' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  expired: '已到期',
  cancelled: '已取消',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  expired: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-700',
}

function getNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getNowPlus24h(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getInitialForm() {
  return {
    ticket_type: '云控' as TicketType,
    ticket_name: '',
    ticket_link: '',
    distribution_link_slug: '',
    number_type: 'whatsapp' as Platform,
    start_time: getNow(),
    end_time: getNowPlus24h(),
    total_quantity: 0,
    download_ratio: 0,
    account: '',
    password: '',
  }
}

const TABLE_COL_COUNT = 15

function OnlineStatusBadge({ online }: { online: number }) {
  if (online === 1) {
    return <span className="inline-flex items-center gap-1 text-green-600 font-medium"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />在线</span>
  }
  const label = online === 0 ? '无号码' : online === 2 ? '异常' : '离线'
  return <span className="inline-flex items-center gap-1 text-red-500 font-medium"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{label}</span>
}

export default function TicketsPage() {
  const router = useRouter()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [slugOptions, setSlugOptions] = useState<string[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(getInitialForm())

  // Keep a ref to the latest workOrders to avoid stale closures in the interval
  const workOrdersRef = useRef<WorkOrder[]>([])
  workOrdersRef.current = workOrders

  const fetchSlugs = useCallback(async () => {
    const { data } = await supabase
      .from('short_links')
      .select('slug')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setSlugOptions((data || []).map((r: { slug: string }) => r.slug))
  }, [])

  const fetchWorkOrders = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    // Using mock data since work_orders table may not exist yet
    setWorkOrders([])
    setLoading(false)
  }, [router])

  // Sync a single work order by calling /api/sync/yunkon
  const syncWorkOrder = useCallback(async (order: WorkOrder): Promise<Partial<WorkOrder>> => {
    try {
      const res = await fetch('/api/sync/yunkon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_link: order.ticket_link }),
      })
      const result = await res.json()
      if (!result.success) return {}

      const { numbers, total_count, total_sum, total_day_sum, online_count, offline_count } = result.data
      const updates: Partial<WorkOrder> = {
        sync_total_sum: total_sum,
        sync_total_day_sum: total_day_sum,
        sync_total_numbers: total_count,
        sync_online_count: online_count,
        sync_offline_count: offline_count,
        sync_numbers: numbers as SyncNumber[],
        last_synced_at: new Date().toISOString(),
      }

      // Auto-complete when total_sum reaches the threshold
      if (total_sum >= order.total_quantity && order.total_quantity > 0) {
        updates.status = 'completed'
      }

      return updates
    } catch {
      return {}
    }
  }, [])

  // Sync all active 云控 orders
  const syncAllActive = useCallback(async () => {
    const orders = workOrdersRef.current
    const active = orders.filter((o) => o.status === 'active' && o.ticket_type === '云控')
    if (active.length === 0) return

    const updatesMap: Record<string, Partial<WorkOrder>> = {}
    await Promise.all(
      active.map(async (order) => {
        const updates = await syncWorkOrder(order)
        if (Object.keys(updates).length > 0) {
          updatesMap[order.id] = updates
        }
      })
    )

    if (Object.keys(updatesMap).length > 0) {
      setWorkOrders((prev) =>
        prev.map((o) => (updatesMap[o.id] ? { ...o, ...updatesMap[o.id] } : o))
      )
    }
  }, [syncWorkOrder])

  useEffect(() => {
    fetchWorkOrders()
    fetchSlugs()
  }, [fetchWorkOrders, fetchSlugs])

  // Auto-sync every minute for active 云控 orders
  useEffect(() => {
    syncAllActive()
    const interval = setInterval(syncAllActive, 60000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenModal = () => {
    setForm(getInitialForm())
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const now = new Date().toISOString()
    const newOrder: WorkOrder = {
      id: `local-${Date.now()}`,
      user_id: 'local',
      ticket_type: form.ticket_type,
      ticket_name: form.ticket_name,
      ticket_link: form.ticket_link,
      distribution_link_slug: form.distribution_link_slug,
      number_type: form.number_type,
      start_time: form.start_time,
      end_time: form.end_time,
      total_quantity: form.total_quantity,
      download_ratio: form.download_ratio,
      account: form.account || null,
      password: form.password || null,
      status: 'active',
      created_at: now,
      updated_at: now,
    }

    setWorkOrders((prev) => [newOrder, ...prev])
    setShowModal(false)

    // Immediately sync if it's a 云控 order
    if (newOrder.ticket_type === '云控' && newOrder.ticket_link) {
      const updates = await syncWorkOrder(newOrder)
      if (Object.keys(updates).length > 0) {
        setWorkOrders((prev) =>
          prev.map((o) => (o.id === newOrder.id ? { ...o, ...updates } : o))
        )
      }
    }
  }

  const updateForm = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
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
          onClick={handleOpenModal}
          className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
        >
          + 新增
        </button>
      </div>

      {/* Work Order List */}
      {workOrders.length === 0 ? (
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium w-8" />
                <th className="px-4 py-3 font-medium">工单类型</th>
                <th className="px-4 py-3 font-medium">工单名称</th>
                <th className="px-4 py-3 font-medium">工单链接</th>
                <th className="px-4 py-3 font-medium">分流链接</th>
                <th className="px-4 py-3 font-medium">号码类型</th>
                <th className="px-4 py-3 font-medium">开始时间</th>
                <th className="px-4 py-3 font-medium">到期时间</th>
                <th className="px-4 py-3 font-medium">工单总量</th>
                <th className="px-4 py-3 font-medium">下号比率</th>
                <th className="px-4 py-3 font-medium">工单账号</th>
                <th className="px-4 py-3 font-medium">引流总数</th>
                <th className="px-4 py-3 font-medium">在线号码</th>
                <th className="px-4 py-3 font-medium">最后同步</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((order) => {
                const isExpanded = expandedRows.has(order.id)
                const canExpand = order.ticket_type === '云控' && (order.sync_numbers?.length ?? 0) > 0
                return (
                  <>
                    <tr
                      key={order.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 ${canExpand ? 'cursor-pointer' : ''}`}
                      onClick={() => canExpand && toggleExpand(order.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {canExpand ? (isExpanded ? '▾' : '▸') : ''}
                      </td>
                      <td className="px-4 py-3">{order.ticket_type}</td>
                      <td className="px-4 py-3">{order.ticket_name}</td>
                      <td className="px-4 py-3 max-w-[160px] truncate">
                        <a
                          href={order.ticket_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {order.ticket_link}
                        </a>
                      </td>
                      <td className="px-4 py-3">{order.distribution_link_slug}</td>
                      <td className="px-4 py-3 capitalize">{order.number_type}</td>
                      <td className="px-4 py-3">{formatDate(order.start_time)}</td>
                      <td className="px-4 py-3">{formatDate(order.end_time)}</td>
                      <td className="px-4 py-3">{order.total_quantity}</td>
                      <td className="px-4 py-3">{order.download_ratio}</td>
                      <td className="px-4 py-3">{order.account || '-'}</td>
                      <td className="px-4 py-3">
                        {order.sync_total_sum !== undefined
                          ? `${order.sync_total_sum}/${order.total_quantity}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {order.sync_online_count !== undefined
                          ? `${order.sync_online_count}/${order.sync_total_numbers ?? 0}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {order.last_synced_at
                          ? new Date(order.last_synced_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[order.status]}`}>
                          {STATUS_LABELS[order.status]}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && order.sync_numbers && order.sync_numbers.length > 0 && (
                      <tr key={`${order.id}-detail`} className="bg-gray-50">
                        <td colSpan={TABLE_COL_COUNT} className="px-8 py-3">
                          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                            <thead>
                              <tr className="bg-gray-100 text-gray-500">
                                <th className="px-3 py-2 text-left font-medium">ID</th>
                                <th className="px-3 py-2 text-left font-medium">账号</th>
                                <th className="px-3 py-2 text-left font-medium">昵称</th>
                                <th className="px-3 py-2 text-left font-medium">状态</th>
                                <th className="px-3 py-2 text-left font-medium">去重引流数</th>
                                <th className="px-3 py-2 text-left font-medium">今日引流</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.sync_numbers.map((num) => (
                                <tr key={num.id} className={`border-t border-gray-100 ${num.online !== 1 ? 'bg-red-50' : ''}`}>
                                  <td className="px-3 py-2">{num.id}</td>
                                  <td className="px-3 py-2">{num.user}</td>
                                  <td className="px-3 py-2">{num.nickname}</td>
                                  <td className="px-3 py-2">
                                    <OnlineStatusBadge online={num.online} />
                                  </td>
                                  <td className="px-3 py-2">{num.sum}</td>
                                  <td className="px-3 py-2">{num.day_sum}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">添加工单管理</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                {/* Row 1: 工单类型 | 工单名称 */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 工单类型
                  </label>
                  <select
                    value={form.ticket_type}
                    onChange={(e) => updateForm('ticket_type', e.target.value)}
                    required
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm"
                  >
                    {TICKET_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 工单名称
                  </label>
                  <input
                    type="text"
                    value={form.ticket_name}
                    onChange={(e) => updateForm('ticket_name', e.target.value)}
                    required
                    placeholder="请输入工单名称"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>

                {/* Row 2: 工单链接 (full width) */}
                <div className="col-span-2 flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 工单链接
                  </label>
                  <input
                    type="text"
                    value={form.ticket_link}
                    onChange={(e) => updateForm('ticket_link', e.target.value)}
                    required
                    placeholder="请输入工单链接"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>

                {/* Row 3: 分流链接 | 号码类型 */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 分流链接
                  </label>
                  <select
                    value={form.distribution_link_slug}
                    onChange={(e) => updateForm('distribution_link_slug', e.target.value)}
                    required
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm"
                  >
                    <option value="">请选择链接</option>
                    {slugOptions.map((slug) => (
                      <option key={slug} value={slug}>{slug}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 号码类型
                  </label>
                  <select
                    value={form.number_type}
                    onChange={(e) => updateForm('number_type', e.target.value)}
                    required
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm"
                  >
                    {NUMBER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Row 4: 开始时间 | 到期时间 */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 开始时间
                  </label>
                  <input
                    type="datetime-local"
                    value={form.start_time}
                    onChange={(e) => updateForm('start_time', e.target.value)}
                    required
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 到期时间
                  </label>
                  <input
                    type="datetime-local"
                    value={form.end_time}
                    onChange={(e) => updateForm('end_time', e.target.value)}
                    required
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>

                {/* Row 5: 工单总量 | 下号比率 */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    <span className="text-red-500">*</span> 工单总量
                  </label>
                  <input
                    type="number"
                    value={form.total_quantity}
                    onChange={(e) => updateForm('total_quantity', Number(e.target.value))}
                    required
                    min={1}
                    placeholder="工单总量"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    下号比率
                  </label>
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateForm('download_ratio', Math.max(0, form.download_ratio - 1))}
                      className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-base font-medium transition-colors"
                    >
                      −
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-800 min-w-[3rem] text-center border-x border-gray-300">
                      {form.download_ratio}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateForm('download_ratio', form.download_ratio + 1)}
                      className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-base font-medium transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Row 6: 工单账号 | 工单密码 */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    工单账号
                  </label>
                  <input
                    type="text"
                    value={form.account}
                    onChange={(e) => updateForm('account', e.target.value)}
                    placeholder="请输入工单账户"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 whitespace-nowrap w-20 flex-shrink-0">
                    工单密码
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateForm('password', e.target.value)}
                    placeholder="请输入工单密码（可选）"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                >
                  确定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
