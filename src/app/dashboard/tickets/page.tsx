/**
 * ==============================================================
 * ⚠️ 工单平台隔离原则（接入新云控时必读，不允许违反）
 * --------------------------------------------------------------
 * 1. 每个云控平台（星河云控 / A2C云控 / 海王云控 / 火箭云控(旧版) / 未来新增的）
 *    都是【完全独立】的代码分支，互不依赖、互不共用函数。
 *
 * 2. 维护或新增功能时只允许 **添加** 自己平台的逻辑：
 *      if (order.ticket_type === '<新云控名>') { ... }
 *    严禁修改、重构、抽取其他云控的代码——即便它们看起来"一模一样"。
 *
 * 3. 任何"为了减少重复"的提取/合并函数都视为违规。重复就是隔离的代价。
 *
 * 4. 业务规则速查（所有平台共有的字段语义）：
 *    - work_orders.total_quantity   = 当日进线目标，达到则工单 status=completed
 *    - work_orders.download_ratio   = 单号码当日进线上限，达到则该号码 is_active=false
 *                                     云控次日 day_sum 归零后该号码自动恢复 is_active=true
 *                                     0 表示不限制
 *    - work_orders.status='completed' → 后端 PUT 路由会停用该工单全部号码（按 label 匹配）
 *    - whatsapp_numbers.label = work_orders.ticket_name（工单 ↔ 号码 关联键，不要改）
 *
 * 5. 同步流程时序（不要打乱）：
 *      a) 拉取上游数据
 *      b) INSERT 新号码到 whatsapp_numbers（先入库，后续才能按 label 停用）
 *      c) 按 download_ratio 调整 is_active
 *      d) PUT /api/work-orders/[id] 持久化 sync_* 字段，必要时 status=completed
 *         （后端 PUT 检测到 completed 会按 label 停用全部号码）
 *
 * 6. 当前各平台支持矩阵（更新到 2026-04）：
 *    | 平台              | 同步 | total_quantity 自动完成 | download_ratio 自动停号 |
 *    |-------------------|------|------------------------|------------------------|
 *    | 星河云控          |  ✅  |          ✅            |          ✅            |
 *    | 海王云控          |  ✅  |          ✅            |          ✅            |
 *    | A2C云控           |  ❌  |          ❌            |          ❌            |
 *    | 火箭云控(旧版)    |  ✅  |          ✅            |          ✅            |
 * ==============================================================
 */
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { WorkOrder, TicketType, Platform, SyncNumber } from '@/types'
import Pagination from '@/components/ui/Pagination'
import { useTopProgress } from '@/context/ProgressContext'
import { useToast } from '@/context/ToastContext'

const TICKET_TYPES: TicketType[] = ['星河云控', 'A2C云控', '海王云控', '火箭云控(旧版)']

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
    ticket_type: '星河云控' as TicketType,
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

const TABLE_COL_COUNT = 15 // total columns: 1 checkbox + 1 expand arrow + 13 data columns

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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

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

  // Update indeterminate state on the select-all checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.size > 0 && selected.size < workOrders.length
    }
  }, [selected.size, workOrders.length])

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
    // ──── 星河云控同步逻辑 ────
    // ⚠️ 以下代码仅处理星河云控，请勿修改
    // 接入新平台请在下方添加独立的 else if 分支
    if (order.ticket_type === '星河云控') {
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

      // Auto-complete when today's count reaches the daily target
      if (total_day_sum >= order.total_quantity && order.total_quantity > 0) {
        updates.status = 'completed'
      }

      // Push synced phone numbers into whatsapp_numbers (号码管理)
      // ⚠️ 必须在 PUT 之前执行，否则后端按 label 停用号码时找不到记录
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

            // Update is_active for already-existing numbers based on current online status
            const existingNumbers = (numbers as SyncNumber[]).filter(
              (num) => num.user && existingSet.has(num.user)
            )
            const toActivate = existingNumbers.filter((n) => n.online === 1).map((n) => n.user)
            const toDeactivate = existingNumbers.filter((n) => n.online !== 1).map((n) => n.user)
            const chunkSize = 100

            if (toActivate.length > 0) {
              for (let i = 0; i < toActivate.length; i += chunkSize) {
                const chunk = toActivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: true })
                  .eq('short_link_id', shortLinkId)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }

            if (toDeactivate.length > 0) {
              for (let i = 0; i < toDeactivate.length; i += chunkSize) {
                const chunk = toDeactivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: false })
                  .eq('short_link_id', shortLinkId)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
          }
        } catch (err) {
          console.error('[syncWorkOrder] Failed to push numbers to 号码管理', err)
        }
      }

      // [星河云控] download_ratio 自动停号
      // 仅在 download_ratio > 0、工单仍为 active 且有分流链接时执行
      // ⚠️ 严禁将此段与海王云控的同名逻辑合并为共用函数——平台隔离原则
      if ((order.download_ratio ?? 0) > 0 && order.status === 'active' && order.distribution_link_slug) {
        try {
          const ratio = order.download_ratio
          const numsArr = numbers as SyncNumber[]

          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()
          if (!linkData) throw new Error('short_link not found')

          const { data: dbNums } = await supabase
            .from('whatsapp_numbers')
            .select('id, phone_number')
            .eq('short_link_id', linkData.id)
            .eq('label', order.ticket_name)

          if (dbNums && dbNums.length > 0) {
            const norm = (s: string) => (s || '').replace(/\D/g, '')
            const toDeactivate: string[] = []
            const toActivate: string[] = []

            for (const dbNum of dbNums) {
              const dbN = norm(dbNum.phone_number)
              const match = numsArr.find((n) => {
                const nN = norm(n.user)
                return nN && dbN && (nN === dbN || nN.endsWith(dbN) || dbN.endsWith(nN))
              })
              if (!match) continue
              if (match.day_sum >= ratio) toDeactivate.push(dbNum.phone_number)
              else toActivate.push(dbNum.phone_number)
            }

            const chunkSize = 100
            if (toDeactivate.length > 0) {
              for (let i = 0; i < toDeactivate.length; i += chunkSize) {
                const chunk = toDeactivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: false })
                  .eq('short_link_id', linkData.id)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
            if (toActivate.length > 0) {
              for (let i = 0; i < toActivate.length; i += chunkSize) {
                const chunk = toActivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: true })
                  .eq('short_link_id', linkData.id)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
          }
        } catch (err) {
          console.error('[syncWorkOrder] download_ratio enforcement failed:', err)
        }
      }

      // Persist sync results to the database (backend handles disabling numbers on completion)
      // ⚠️ 必须在 INSERT 之后执行，status=completed 触发后端按 label 停用号码时记录已存在
      const persistRes = await fetch(`/api/work-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!persistRes.ok) {
        console.error('[syncWorkOrder] Failed to persist sync results for order', order.id)
      }

      return updates
    }
    // ──── A2C云控同步逻辑 ────
    // TODO: 待实现
    else if (order.ticket_type === 'A2C云控') {
      const res = await fetch('/api/sync/a2c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_link: order.ticket_link }),
      })
      const result = await res.json()
      if (!result.success) return {}
      // TODO: 解析 A2C 返回数据并构建 updates 对象
    }
    // ──── 海王云控同步逻辑 ────
    else if (order.ticket_type === '海王云控') {
      const res = await fetch('/api/sync/haiwang', {
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

      // Auto-complete when today's count reaches the daily target
      if (total_day_sum >= order.total_quantity && order.total_quantity > 0) {
        updates.status = 'completed'
      }

      // Push synced phone numbers into whatsapp_numbers (号码管理)
      // ⚠️ 必须在 PUT 之前执行，否则后端按 label 停用号码时找不到记录
      if (numbers && numbers.length > 0 && order.distribution_link_slug) {
        try {
          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()

          if (linkData) {
            const shortLinkId = linkData.id
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

            // Update is_active for already-existing numbers based on current online status
            const existingNumbers = (numbers as SyncNumber[]).filter(
              (num) => num.user && existingSet.has(num.user)
            )
            const toActivate = existingNumbers.filter((n) => n.online === 1).map((n) => n.user)
            const toDeactivate = existingNumbers.filter((n) => n.online !== 1).map((n) => n.user)
            const chunkSize = 100

            if (toActivate.length > 0) {
              for (let i = 0; i < toActivate.length; i += chunkSize) {
                const chunk = toActivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: true })
                  .eq('short_link_id', shortLinkId)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }

            if (toDeactivate.length > 0) {
              for (let i = 0; i < toDeactivate.length; i += chunkSize) {
                const chunk = toDeactivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: false })
                  .eq('short_link_id', shortLinkId)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
          }
        } catch (err) {
          console.error('[syncWorkOrder] Failed to push numbers to 号码管理', err)
        }
      }

      // [海王云控] download_ratio 自动停号
      // 仅在 download_ratio > 0、工单仍为 active 且有分流链接时执行
      // ⚠️ 严禁将此段与星河云控的同名逻辑合并为共用函数——平台隔离原则
      if ((order.download_ratio ?? 0) > 0 && order.status === 'active' && order.distribution_link_slug) {
        try {
          const ratio = order.download_ratio
          const numsArr = numbers as SyncNumber[]

          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()
          if (!linkData) throw new Error('short_link not found')

          const { data: dbNums } = await supabase
            .from('whatsapp_numbers')
            .select('id, phone_number')
            .eq('short_link_id', linkData.id)
            .eq('label', order.ticket_name)

          if (dbNums && dbNums.length > 0) {
            const norm = (s: string) => (s || '').replace(/\D/g, '')
            const toDeactivate: string[] = []
            const toActivate: string[] = []

            for (const dbNum of dbNums) {
              const dbN = norm(dbNum.phone_number)
              const match = numsArr.find((n) => {
                const nN = norm(n.user)
                return nN && dbN && (nN === dbN || nN.endsWith(dbN) || dbN.endsWith(nN))
              })
              if (!match) continue
              if (match.day_sum >= ratio) toDeactivate.push(dbNum.phone_number)
              else toActivate.push(dbNum.phone_number)
            }

            const chunkSize = 100
            if (toDeactivate.length > 0) {
              for (let i = 0; i < toDeactivate.length; i += chunkSize) {
                const chunk = toDeactivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: false })
                  .eq('short_link_id', linkData.id)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
            if (toActivate.length > 0) {
              for (let i = 0; i < toActivate.length; i += chunkSize) {
                const chunk = toActivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: true })
                  .eq('short_link_id', linkData.id)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
          }
        } catch (err) {
          console.error('[syncWorkOrder] download_ratio enforcement failed:', err)
        }
      }

      // Persist sync results to the database
      // ⚠️ 必须在 INSERT 之后执行，status=completed 触发后端按 label 停用号码时记录已存在
      const persistRes = await fetch(`/api/work-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!persistRes.ok) {
        console.error('[syncWorkOrder] Failed to persist sync results for order', order.id)
      }

      return updates
    }
    // ──── 火箭云控(旧版)同步逻辑 ────
    // ⚠️ 以下代码仅处理火箭云控(旧版)，请勿修改
    // 接入新平台请在下方添加独立的 else if 分支
    else if (order.ticket_type === '火箭云控(旧版)') {
      const res = await fetch('/api/sync/huojian_old', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_link: order.ticket_link, password: order.password }),
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

      // Auto-complete when today's count reaches the daily target
      if (total_day_sum >= order.total_quantity && order.total_quantity > 0) {
        updates.status = 'completed'
      }

      // Push synced phone numbers into whatsapp_numbers (号码管理)
      // ⚠️ 必须在 PUT 之前执行，否则后端按 label 停用号码时找不到记录
      if (numbers && numbers.length > 0 && order.distribution_link_slug) {
        try {
          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()

          if (linkData) {
            const shortLinkId = linkData.id
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

            // Update is_active for already-existing numbers based on current online status
            const existingNumbers = (numbers as SyncNumber[]).filter(
              (num) => num.user && existingSet.has(num.user)
            )
            const toActivate = existingNumbers.filter((n) => n.online === 1).map((n) => n.user)
            const toDeactivate = existingNumbers.filter((n) => n.online !== 1).map((n) => n.user)
            const chunkSize = 100

            if (toActivate.length > 0) {
              for (let i = 0; i < toActivate.length; i += chunkSize) {
                const chunk = toActivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: true })
                  .eq('short_link_id', shortLinkId)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }

            if (toDeactivate.length > 0) {
              for (let i = 0; i < toDeactivate.length; i += chunkSize) {
                const chunk = toDeactivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: false })
                  .eq('short_link_id', shortLinkId)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
          }
        } catch (err) {
          console.error('[syncWorkOrder] Failed to push numbers to 号码管理', err)
        }
      }

      // [火箭云控(旧版)] download_ratio 自动停号
      // 仅在 download_ratio > 0、工单仍为 active 且有分流链接时执行
      // ⚠️ 严禁将此段与星河/海王云控的同名逻辑合并为共用函数——平台隔离原则
      if ((order.download_ratio ?? 0) > 0 && order.status === 'active' && order.distribution_link_slug) {
        try {
          const ratio = order.download_ratio
          const numsArr = numbers as SyncNumber[]

          const { data: linkData } = await supabase
            .from('short_links')
            .select('id')
            .eq('slug', order.distribution_link_slug)
            .single()
          if (!linkData) throw new Error('short_link not found')

          const { data: dbNums } = await supabase
            .from('whatsapp_numbers')
            .select('id, phone_number')
            .eq('short_link_id', linkData.id)
            .eq('label', order.ticket_name)

          if (dbNums && dbNums.length > 0) {
            const norm = (s: string) => (s || '').replace(/\D/g, '')
            const toDeactivate: string[] = []
            const toActivate: string[] = []

            for (const dbNum of dbNums) {
              const dbN = norm(dbNum.phone_number)
              const match = numsArr.find((n) => {
                const nN = norm(n.user)
                return nN && dbN && (nN === dbN || nN.endsWith(dbN) || dbN.endsWith(nN))
              })
              if (!match) continue
              if (match.day_sum >= ratio) toDeactivate.push(dbNum.phone_number)
              else toActivate.push(dbNum.phone_number)
            }

            const chunkSize = 100
            if (toDeactivate.length > 0) {
              for (let i = 0; i < toDeactivate.length; i += chunkSize) {
                const chunk = toDeactivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: false })
                  .eq('short_link_id', linkData.id)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
            if (toActivate.length > 0) {
              for (let i = 0; i < toActivate.length; i += chunkSize) {
                const chunk = toActivate.slice(i, i + chunkSize)
                await supabase
                  .from('whatsapp_numbers')
                  .update({ is_active: true })
                  .eq('short_link_id', linkData.id)
                  .eq('label', order.ticket_name)
                  .in('phone_number', chunk)
              }
            }
          }
        } catch (err) {
          console.error('[syncWorkOrder] download_ratio enforcement failed:', err)
        }
      }

      // Persist sync results to the database
      // ⚠️ 必须在 INSERT 之后执行，status=completed 触发后端按 label 停用号码时记录已存在
      const persistRes = await fetch(`/api/work-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!persistRes.ok) {
        console.error('[syncWorkOrder] Failed to persist sync results for order', order.id)
      }

      return updates
    }

    return {}
  }, [])

  // Sync all active orders
  const syncAllActive = useCallback(async () => {
    const orders = workOrdersRef.current
    const activeOrders = orders.filter((o) => o.status === 'active')
    if (activeOrders.length === 0) return

    const results = await Promise.allSettled(
      activeOrders.map(async (order) => {
        await syncWorkOrder(order)
      })
    )

    // Revalidate to refresh UI with latest server data
    await mutate()

    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      throw new Error(`${failed.length} 个工单同步失败`)
    }
  }, [syncWorkOrder, mutate])

  // Keep refs to the latest syncAllActive and a syncing flag to prevent stale closures
  // and concurrent sync runs in the interval.
  const syncAllActiveRef = useRef(syncAllActive)
  syncAllActiveRef.current = syncAllActive
  const isSyncingRef = useRef(false)

  useEffect(() => {
    fetchSlugs()
  }, [fetchSlugs])

  // Redirect to login when SWR throws an unauthenticated error
  useEffect(() => {
    if (swrError?.message === 'unauthenticated') {
      router.push('/login')
    }
  }, [swrError, router])

  // Auto-sync every minute for active 星河云控 orders
  useEffect(() => {
    const run = async () => {
      if (isSyncingRef.current) return
      isSyncingRef.current = true
      try {
        await syncAllActiveRef.current()
      } finally {
        isSyncingRef.current = false
      }
    }
    run()
    const interval = setInterval(run, 60000)
    return () => clearInterval(interval)
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

  const handleDelete = async (e: React.MouseEvent, order: WorkOrder) => {
    e.stopPropagation()
    // Query count of associated numbers to show in the confirm dialog
    const { count, error: countErr } = await supabase
      .from('whatsapp_numbers')
      .select('*', { count: 'exact', head: true })
      .eq('label', order.ticket_name)
    if (countErr) {
      console.error('[handleDelete] Failed to count associated numbers:', countErr)
    }

    if (!window.confirm(
      `确认删除工单 "${order.ticket_name}" 吗？\n\n` +
      `此操作将同时删除该工单关联的 ${count ?? 0} 个 WhatsApp 号码，且不可恢复。`
    )) return
    start()
    try {
      const res = await fetch(`/api/work-orders/${order.id}`, { method: 'DELETE' })
      if (res.ok) {
        const json = await res.json().catch(() => ({}))
        const deletedNums = json.deleted_numbers ?? 0
        showToast(`工单已删除，同时删除了 ${deletedNums} 个关联号码`, 'success')
        await mutate()
        await globalMutate(
          (key) => Array.isArray(key) && (
            key[0] === '/api/numbers' ||
            key[0] === 'allPhones' ||
            key[0] === 'allLabels'
          ),
          undefined,
          { revalidate: true }
        )
      } else {
        const errData = await res.json().catch(() => ({}))
        showToast(errData.error || '删除失败', 'error')
      }
    } finally {
      done()
    }
  }

  const handleToggleStatus = async (e: React.MouseEvent, order: WorkOrder) => {
    e.stopPropagation()
    const newStatus = order.status === 'active' ? 'cancelled' : 'active'
    start()
    try {
      const res = await fetch(`/api/work-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
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

        await mutate()
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data.error || '状态更新失败', 'error')
      }
    } finally {
      done()
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === workOrders.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(workOrders.map((o) => o.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    const selectedOrders = workOrders.filter((o) => selected.has(o.id))
    const labels = selectedOrders.map((o) => o.ticket_name)
    // Query count of associated numbers for all selected orders
    const { count, error: countErr } = await supabase
      .from('whatsapp_numbers')
      .select('*', { count: 'exact', head: true })
      .in('label', labels)
    if (countErr) {
      console.error('[handleBulkDelete] Failed to count associated numbers:', countErr)
    }

    if (!window.confirm(
      `确认删除选中的 ${selectedOrders.length} 个工单吗？\n\n` +
      `此操作将同时删除关联的 ${count ?? 0} 个 WhatsApp 号码，且不可恢复。`
    )) return
    start()
    try {
      const results = await Promise.all(
        Array.from(selected).map((id) => fetch(`/api/work-orders/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => !r.ok).length
      if (failed > 0) {
        showToast(`${failed} 个工单删除失败`, 'error')
      } else {
        const jsons = await Promise.all(results.map((r) => r.json().catch(() => ({}))))
        const totalDeleted = jsons.reduce((sum: number, j) => sum + (j.deleted_numbers ?? 0), 0)
        showToast(`已删除 ${selectedOrders.length} 个工单，同时删除了 ${totalDeleted} 个关联号码`, 'success')
      }
      setSelected(new Set())
      await mutate()
    } catch {
      showToast('批量删除失败', 'error')
    } finally {
      done()
    }
  }

  const handleBulkToggleStatus = async (newStatus: 'active' | 'cancelled') => {
    if (selected.size === 0) return
    start()
    try {
      const targetOrders = workOrders.filter((o) => selected.has(o.id))
      const results = await Promise.all(
        targetOrders.map((order) =>
          fetch(`/api/work-orders/${order.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          })
        )
      )
      const failed = results.filter((r) => !r.ok).length
      if (failed > 0) {
        showToast(`${failed} 个工单状态更新失败`, 'error')
      } else {
        showToast(`已${newStatus === 'active' ? '启用' : '停用'} ${selected.size} 个工单`, 'success')
      }
      // Sync whatsapp_numbers is_active for orders that succeeded
      const succeededOrders = targetOrders.filter((_, idx) => results[idx].ok)
      await Promise.all(
        succeededOrders.map(async (order) => {
          const phoneNumbers = order.sync_numbers?.map((n) => n.user).filter(Boolean) || []
          if (phoneNumbers.length > 0 && order.distribution_link_slug) {
            try {
              const { data: linkData } = await supabase
                .from('short_links')
                .select('id')
                .eq('slug', order.distribution_link_slug)
                .single()
              if (linkData) {
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
              console.error('[handleBulkToggleStatus] Failed to update numbers for slug', order.distribution_link_slug, err)
            }
          }
        })
      )
      setSelected(new Set())
      await mutate()
    } catch {
      showToast('批量操作失败', 'error')
    } finally {
      done()
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
        await res.json()
        await mutate()
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

      // Immediately sync after creating a 星河云控 order
      if (newOrder.ticket_link && newOrder.ticket_type === '星河云控') {
        // Fire and forget - let the sync happen in the background
        const syncFn = async () => {
          const updates = await syncWorkOrder(newOrder)
          if (Object.keys(updates).length > 0) {
            await mutate()
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

      {/* Bulk Operations Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {selected.size > 0 && (
          <span className="text-sm text-gray-600">已选 {selected.size} 个</span>
        )}
        <button
          onClick={() => handleBulkToggleStatus('active')}
          disabled={selected.size === 0}
          className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          批量打开
        </button>
        <button
          onClick={() => handleBulkToggleStatus('cancelled')}
          disabled={selected.size === 0}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          批量关闭
        </button>
        <button
          onClick={handleBulkDelete}
          disabled={selected.size === 0}
          className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          批量删除
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-700">
                <th className="px-5 py-4 font-bold text-gray-700 w-8">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={workOrders.length > 0 && selected.size === workOrders.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
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
                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="rounded"
                        />
                      </td>
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
                            onClick={(e) => handleDelete(e, order)}
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
                  <input
                    type="number"
                    value={form.download_ratio}
                    onChange={(e) => updateForm('download_ratio', Math.max(0, Number(e.target.value) || 0))}
                    min={0}
                    placeholder="0"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  />
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
                    placeholder="请输入工单密码（可选）"
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
