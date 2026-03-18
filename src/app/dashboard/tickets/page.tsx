'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { WorkOrder, TicketType, Platform } from '@/types'

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

export default function TicketsPage() {
  const router = useRouter()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [slugOptions, setSlugOptions] = useState<string[]>([])

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(getInitialForm())

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

  useEffect(() => {
    fetchWorkOrders()
    fetchSlugs()
  }, [fetchWorkOrders, fetchSlugs])

  const handleOpenModal = () => {
    setForm(getInitialForm())
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('formData', form)
    setShowModal(false)
  }

  const updateForm = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
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
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">{order.ticket_type}</td>
                  <td className="px-4 py-3">{order.ticket_name}</td>
                  <td className="px-4 py-3 max-w-[160px] truncate">
                    <a href={order.ticket_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
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
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                </tr>
              ))}
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
                    placeholder="请输入工单密码"
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
