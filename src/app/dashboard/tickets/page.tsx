'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { WorkOrder, TicketType, Platform, SyncNumber } from '@/types'
import Pagination from '@/components/ui/Pagination'
import { useTopProgress } from '@/context/ProgressContext'
import { useToast } from '@/context/ToastContext'

const TICKET_TYPES: TicketType[] = ['云控', '火箭']

const TICKET_LINK_PLACEHOLDER: Record<TicketType, string> = {
  云控: '请输入工单链接',
  火箭: '请粘贴完整链接（如 v4.url66.me/gds?link=xxx）或短链接',
}

const NUMBER_TYPES: { value: Platform; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'line', label: 'Line' },
  { value: 'custom', label: 'Custom' },
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  expired: '已到期',
  cancelled: '已取消',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  expired: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-700',
}

// Extract work order ID and API host from a URL's `link=` query parameter.
// Returns null if the parameter is absent or has an invalid format.
function extractWorkOrderId(url: string): { workOrderId: string; apiHost: string } | null {
  try {
    const parsed = new URL(url)
    const linkParam = parsed.searchParams.get('link')
    if (linkParam && /^[a-zA-Z0-9]+$/.test(linkParam)) {
      return { workOrderId: linkParam, apiHost: parsed.origin }
    }
  } catch {
    // not a valid URL
  }
  return null
}

// Directly call the Huojian API from the browser (bypasses Vercel server-side 403)
async function syncHuojianDirect(
  ticketLink: string,
  password: string
): Promise<{ success: boolean; data?: { numbers: SyncNumber[]; total_count: number; total_sum: number; total_day_sum: number; online_count: number; offline_count: number }; error?: string }> {
  const extracted = extractWorkOrderId(ticketLink)
  if (!extracted) {
    return {
      success: false,
      error: '无法解析工单链接。请粘贴完整链接（格式如 https://v4.url66.me/gds?link=xxx）',
    }
  }

  const { workOrderId, apiHost } = extracted
  const apiUrl = `${apiHost}/prod-api1/biz/counter/link/share/${workOrderId}`

  const apiResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify({
      password: password || '',
      accountLogin: '',
      accountStatus: '',
      csName: '',
      isDelete: 0,
      isEnable: '',
    }),
  })

  if (!apiResponse.ok) {
    return { success: false, error: `Huojian API error: ${apiResponse.status}` }
  }

  const result = await apiResponse.json()
  if (result.code !== 0) {
    return {
      success: false,
      error: `Huojian API 返回错误码: ${result.code}`,
    }
  }

  const accounts: { accountLogin: string; accountNickName: string | null; accountStatus: number; newTotalFriend: number; newTodayFriend: number }[] = result.counterCsAccountVo || []
  const numbers: SyncNumber[] = accounts.map((n) => ({
    id: n.accountLogin,
    user: n.accountLogin,
    nickname: n.accountNickName ?? '',
    online: n.accountStatus,
    sum: n.newTotalFriend,
    day_sum: n.newTodayFriend,
  }))

  return {
    success: true,
    data: {
      numbers,
      total_count: accounts.length,
      total_sum: result.counterWorker.newTotalFriend,
      total_day_sum: result.counterWorker.newTodayFriend,
      online_count: accounts.filter((n) => n.accountStatus === 1).length,
      offline_count: accounts.filter((n) => n.accountStatus !== 1).length,
    },
  }
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

const TABLE_COL_COUNT = 14 // total columns: 1 expand arrow + 13 data columns

function OnlineStatusBadge({ online }: { online: number }) {
  if (online === 1) {
    return <span className="inline-flex items-center gap-1 text-green-600 font-medium"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />在线</span>
  }
  const label = online === 0 ? '无号码' : online === 2 ? '异常' : '离线'
  return <span className="inline-flex items-center gap-1 text-red-500 font-medium"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{label}</span>
}

async function workOrdersFetcher(
  _key: string,
  page: number,
  pageSize: number
): Promise<{ data: WorkOrder[]; count: number }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) throw new Error('unauthenticated')
  const from = (page - 1) * pageSize
  const { data, count, error } = await supabase
    .from('work_orders')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return { data: (data as WorkOrder[]) || [], count: count || 0 }
}

export default function TicketsPage() {
  const router = useRouter()
  const { start, done } = useTopProgress()
  const { showToast } = useToast()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [syncing, setSyncing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [slugOptions, setSlugOptions] = useState<string[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  // Per-modal-session idempotency key; regenerated each time modal opens for create.
  const submitIdempotencyKeyRef = useRef(crypto.randomUUID())

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null)
  const [form, setForm] = useState(getInitialForm())

  const { data: swrData, isLoading: loading, error: swrError, mutate } = useSWR(
    ['work_orders', page, pageSize],
    ([key, p, ps]) => workOrdersFetcher(key, p as number, ps as number),
    { keepPreviousData: true, revalidateOnFocus: true }
  )

  const workOrders = swrData?.data ?? []
  const totalCount = swrData?.count ?? 0

  // Keep a ref to the latest workOrders to avoid stale closures in the interval
  const workOrdersRef = useRef<WorkOrder[]>([])
  workOrdersRef.current = workOrders

  const fetchSlugs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const role = profile?.role
    const isUserAdmin = role === 'admin' || role === 'root' || role === 'root_admin'
    let query = supabase
      .from('short_links')
      .select('slug')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (!isUserAdmin) {
      query = query.eq('user_id', user.id)
    }
    const { data } = await query
    setSlugOptions((data || []).map((r: { slug: string }) => r.slug))
  }, [])

  // Sync a single work order by calling the sync API
  const syncWorkOrder = useCallback(async (order: WorkOrder): Promise<Partial<WorkOrder>> => {
    try {
      let result: { success: boolean; data?: { numbers: SyncNumber[]; total_count: number; total_sum: number; total_day_sum: number; online_count: number; offline_count: number }; error?: string }

      if (order.ticket_type === '火箭') {
        // Call Huojian API directly from the browser to bypass Vercel server-side 403
        result = await syncHuojianDirect(order.ticket_link, order.password || '')
      } else {
        // Yunkon continues to use the server-side proxy
        const res = await fetch('/api/sync/yunkon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket_link: order.ticket_link }),
        })
        result = await res.json()
      }

      if (!result.success || !result.data) return {}

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

      // Persist sync results to the database
      const persistRes = await fetch(`/api/work-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!persistRes.ok) {
        console.error('[syncWorkOrder] Failed to persist sync results for order', order.id)
      }

      // Push synced phone numbers into whatsapp_numbers (号码管理)
      if (numbers && numbers.length > 0 && order.distribution_link_slug) {
        try {
          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()

          if (linkData) {
            const shortLinkId = linkData.id
            // Fetch existing phone numbers for this specific work order (by label)
            // to avoid re-inserting the same number on every sync cycle.
            // Phones added by other work orders (different label) are allowed to co-exist.
            const { data: existingNums } = await supabase
              .from('whatsapp_numbers')
              .select('phone_number')
              .eq('short_link_id', shortLinkId)
              .eq('label', order.ticket_name)

            const existingSet = new Set(
              (existingNums || []).map((n: { phone_number: string }) => n.phone_number)
            )

            const toInsert = (numbers as SyncNumber[])
              .filter((num) => num.user && !existingSet.has(num.user))
              .map((num, idx) => ({
                short_link_id: shortLinkId,
                phone_number: num.user,
                label: order.ticket_name,
                platform: order.number_type,
                is_active: num.online === 1,
                sort_order: idx,
              }))

            if (toInsert.length > 0) {
              const { error: insertError } = await supabase.from('whatsapp_numbers').insert(toInsert)
              if (insertError) {
                console.error('[syncWorkOrder] Failed to insert numbers to 号码管理', insertError.message)
              }
            }
          }
        } catch (err) {
          console.error('[syncWorkOrder] Failed to push numbers to 号码管理', err)
        }
      }

      return updates
    } catch {
      return {}
    }
  }, [])

  // Sync all active orders (云控 via Yunkon API)
  const syncAllActive = useCallback(async () => {
    const orders = workOrdersRef.current
    const activeOrders = orders.filter((o) => o.status === 'active')
    if (activeOrders.length === 0) return

    const updatesMap: Record<string, Partial<WorkOrder>> = {}
    await Promise.all(
      activeOrders.map(async (order) => {
        if (!TICKET_TYPES.includes(order.ticket_type)) return
        const updates = await syncWorkOrder(order)
        if (Object.keys(updates).length > 0) {
          updatesMap[order.id] = updates
        }
      })
    )

    if (Object.keys(updatesMap).length > 0) {
      await mutate(
        (prev) => prev
          ? {
              ...prev,
              data: prev.data.map((o) => (updatesMap[o.id] ? { ...o, ...updatesMap[o.id] } : o)),
            }
          : prev,
        { revalidate: false }
      )
    }
  }, [syncWorkOrder, mutate])

  useEffect(() => {
    fetchSlugs()
  }, [fetchSlugs])

  // Redirect to login when SWR throws an unauthenticated error
  useEffect(() => {
    if (swrError?.message === 'unauthenticated') {
      router.push('/login')
    }
  }, [swrError, router])

  // Auto-sync every minute for active 云控 orders
  useEffect(() => {
    syncAllActive()
    const interval = setInterval(syncAllActive, 60000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleManualRefresh = async () => {
    setSyncing(true)
    start()
    try {
      await syncAllActive()
      showToast('同步完成', 'success')
    } catch {
      showToast('同步失败', 'error')
    } finally {
      setSyncing(false)
      done()
    }
  }

  const handleOpenModal = () => {
    setEditingOrder(null)
    setForm(getInitialForm())
    setSubmitError(null)
    // Rotate idempotency key for each new create session.
    submitIdempotencyKeyRef.current = crypto.randomUUID()
    setShowModal(true)
  }

  const handleEdit = (e: React.MouseEvent, order: WorkOrder) => {
    e.stopPropagation()
    setEditingOrder(order)
    setForm({
      ticket_type: order.ticket_type,
      ticket_name: order.ticket_name,
      ticket_link: order.ticket_link,
      distribution_link_slug: order.distribution_link_slug,
      number_type: order.number_type,
      start_time: order.start_time.slice(0, 16),
      end_time: order.end_time.slice(0, 16),
      total_quantity: order.total_quantity,
      download_ratio: order.download_ratio,
      account: order.account || '',
      password: order.password || '',
    })
    setSubmitError(null)
    setShowModal(true)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!window.confirm('确认删除该工单？')) return
    start()
    try {
      const res = await fetch(`/api/work-orders/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('工单已删除', 'success')
        await mutate()
      } else {
        showToast('删除失败', 'error')
      }
    } finally {
      done()
    }
  }

  const handleToggleStatus = async (e: React.MouseEvent, order: WorkOrder) => {
    e.stopPropagation()
    const newStatus = order.status === 'active' ? 'cancelled' : 'active'
    const res = await fetch(`/api/work-orders/${order.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      await mutate(
        (prev) => prev
          ? { ...prev, data: prev.data.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)) }
          : prev,
        { revalidate: false }
      )

      // Get exact phone numbers synced by this work order
      const phoneNumbers = order.sync_numbers?.map((n) => n.user).filter(Boolean) || []

      if (phoneNumbers.length > 0 && order.distribution_link_slug) {
        try {
          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()

          if (linkData) {
            // Chunk updates to avoid URL length limits on the 'in' filter
            const chunkSize = 100
            for (let i = 0; i < phoneNumbers.length; i += chunkSize) {
              const chunk = phoneNumbers.slice(i, i + chunkSize)
              await supabase
                .from('whatsapp_numbers')
                .update({ is_active: newStatus === 'active' })
                .eq('short_link_id', linkData.id)
                .in('phone_number', chunk)
            }
          }
        } catch (err) {
          console.error('[handleToggleStatus] Failed to update numbers for slug', order.distribution_link_slug, err)
        }
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // ── Layer 1: prevent duplicate submissions while request is in-flight ──
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    start()

    const payload = {
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
    }

    try {
      if (editingOrder) {
        // Edit mode – idempotency not required for updates
        const res = await fetch(`/api/work-orders/${editingOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setSubmitError(err.error || '更新工单失败，请稍后重试')
          return
        }
        const updated: WorkOrder = await res.json()
        await mutate(
          (prev) => prev
            ? { ...prev, data: prev.data.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)) }
            : prev,
          { revalidate: false }
        )
        showToast('工单已更新', 'success')
        setShowModal(false)
        setEditingOrder(null)
        return
      }

      // Create mode – attach idempotency key so retries return cached result
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': submitIdempotencyKeyRef.current,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSubmitError(err.error || '创建工单失败，请稍后重试')
        return
      }
      const newOrder: WorkOrder = await res.json()

      // Rotate key after success so next create gets a fresh key.
      submitIdempotencyKeyRef.current = crypto.randomUUID()
      await mutate()
      showToast('工单创建成功', 'success')
      setShowModal(false)

      // Immediately sync after creating a syncable order
      if (newOrder.ticket_link && TICKET_TYPES.includes(newOrder.ticket_type)) {
        // Fire and forget - let the sync happen in the background
        const syncFn = async () => {
          const updates = await syncWorkOrder(newOrder)
          if (Object.keys(updates).length > 0) {
            await mutate(
              (prev) => prev
                ? { ...prev, data: prev.data.map((o) => (o.id === newOrder.id ? { ...o, ...updates } : o)) }
                : prev,
              { revalidate: false }
            )
          }
        }
        syncFn().catch((err) => console.error('[auto-sync] Failed to sync order', newOrder.id, err))
      }
    } finally {
      setIsSubmitting(false)
      done()
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

  if (loading && workOrders.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-20 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                {Array.from({ length: TABLE_COL_COUNT }).map((_, i) => (
                  <th key={i} className="py-4 px-5">
                    <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: TABLE_COL_COUNT }).map((__, j) => (
                    <td key={j} className="py-4 px-5">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${45 + (j * 11) % 50}%` }} />
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
        <h1 className="text-2xl font-bold text-gray-900">工单管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={syncing}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors flex items-center gap-1"
          >
            {syncing ? '同步中...' : '🔄 刷新'}
          </button>
          <button
            onClick={handleOpenModal}
            className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
          >
            + 新增
          </button>
        </div>
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-700">
                <th className="px-5 py-4 font-bold text-gray-700 w-8" />
                <th className="px-5 py-4 font-bold text-gray-700">工单类型</th>
                <th className="px-5 py-4 font-bold text-gray-700">工单名称</th>
                <th className="px-5 py-4 font-bold text-gray-700">工单链接</th>
                <th className="px-5 py-4 font-bold text-gray-700">分流链接</th>
                <th className="px-5 py-4 font-bold text-gray-700">号码类型</th>
                <th className="px-5 py-4 font-bold text-gray-700">开始时间</th>
                <th className="px-5 py-4 font-bold text-gray-700">到期时间</th>
                <th className="px-5 py-4 font-bold text-gray-700">工单总量</th>
                <th className="px-5 py-4 font-bold text-gray-700">下号比率</th>
                <th className="px-5 py-4 font-bold text-gray-700">同步状态</th>
                <th className="px-5 py-4 font-bold text-gray-700">当日引流</th>
                <th className="px-5 py-4 font-bold text-gray-700">在线号码</th>
                <th className="px-5 py-4 font-bold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((order) => {
                const isExpanded = expandedRows.has(order.id)
                const canExpand = (order.sync_numbers?.length ?? 0) > 0
                return (
                  <>
                    <tr
                      key={order.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 ${canExpand ? 'cursor-pointer' : ''}`}
                      onClick={() => canExpand && toggleExpand(order.id)}
                    >
                      <td className="px-5 py-4 text-gray-600">
                        {canExpand ? (isExpanded ? '▾' : '▸') : ''}
                      </td>
                      <td className="px-5 py-4">{order.ticket_type}</td>
                      <td className="px-5 py-4">{order.ticket_name}</td>
                      <td className="px-5 py-4 max-w-[160px] truncate">
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
                      <td className="px-5 py-4">{order.distribution_link_slug}</td>
                      <td className="px-5 py-4 capitalize">{order.number_type}</td>
                      <td className="px-5 py-4">{formatDate(order.start_time)}</td>
                      <td className="px-5 py-4">{formatDate(order.end_time)}</td>
                      <td className="px-5 py-4">{order.total_quantity}</td>
                      <td className="px-5 py-4">{order.download_ratio}</td>
                      <td className="px-5 py-4">
                        {order.last_synced_at && order.sync_online_count !== undefined
                          ? <span className="text-green-600 font-medium">已同步</span>
                          : !order.last_synced_at && order.status === 'active'
                            ? <span className="text-blue-500 font-medium">同步中</span>
                            : order.last_synced_at && order.sync_online_count === undefined
                              ? <span className="text-red-500 font-medium">异常</span>
                              : <span className="text-gray-400">待同步</span>}
                      </td>
                      <td className="px-5 py-4">
                        {order.sync_total_day_sum !== undefined
                          ? `${order.sync_total_day_sum}/${order.total_quantity}`
                          : '-'}
                      </td>
                      <td className="px-5 py-4">
                        {order.sync_online_count !== undefined
                          ? `${order.sync_online_count}`
                          : '-'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Toggle switch */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleStatus(e, order)}
                            aria-label={order.status === 'active' ? '停用工单' : '启用工单'}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${order.status === 'active' ? 'bg-blue-500' : 'bg-gray-300'}`}
                            title={order.status === 'active' ? '点击停用' : '点击启用'}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${order.status === 'active' ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleEdit(e, order)}
                            className="text-blue-500 hover:text-blue-700 text-xs whitespace-nowrap"
                          >
                            ✏ 修改
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, order.id)}
                            className="text-red-500 hover:text-red-700 text-xs whitespace-nowrap"
                          >
                            🗑 删除
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && order.sync_numbers && order.sync_numbers.length > 0 && (
                      <tr key={`${order.id}-detail`} className="bg-gray-50">
                        <td colSpan={TABLE_COL_COUNT} className="px-8 py-3">
                          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                            <thead>
                              <tr className="bg-gray-100 text-gray-700">
                                <th className="px-5 py-4 text-left font-bold text-gray-700">ID</th>
                                <th className="px-5 py-4 text-left font-bold text-gray-700">账号</th>
                                <th className="px-5 py-4 text-left font-bold text-gray-700">昵称</th>
                                <th className="px-5 py-4 text-left font-bold text-gray-700">状态</th>
                                <th className="px-5 py-4 text-left font-bold text-gray-700">去重引流数</th>
                                <th className="px-5 py-4 text-left font-bold text-gray-700">今日引流</th>
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

        {/* Pagination */}
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        />
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{editingOrder ? '编辑工单' : '添加工单管理'}</h2>
              <button
                onClick={() => { setShowModal(false); setEditingOrder(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6" autoComplete="off">
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
                    placeholder={TICKET_LINK_PLACEHOLDER[form.ticket_type as TicketType] ?? '请输入工单链接'}
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
                    autoComplete="off"
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
                    placeholder={form.ticket_type === '火箭' ? '请输入工单密码（火箭云控必填）' : '请输入工单密码（可选）'}
                    autoComplete="new-password"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              {submitError && (
                <p className="text-sm text-red-500 mt-4">{submitError}</p>
              )}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingOrder(null) }}
                  className="px-6 py-2 text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
                >
                  {isSubmitting ? '提交中...' : (editingOrder ? '保存' : '确定')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
