/**
 * ==============================================================
 * ⚠️ 工单平台隔离原则（接入新云控时必读，不允许违反）
 * --------------------------------------------------------------
 * 1. 每个云控平台（星河云控 / A2C云控 / 海王云控 / 未来新增的）
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
 *    | 平台      | 同步 | total_quantity 自动完成 | download_ratio 自动停号 |
 *    |-----------|------|------------------------|------------------------|
 *    | 星河云控  |  ✅  |          ✅            |          ✅            |
 *    | 海王云控  |  ✅  |          ✅            |          ✅            |
 *    | A2C云控   |  ❌  |          ❌            |          ❌            |
 * ==============================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

interface YunkonNumber {
  id: number
  nickname: string
  user: string
  online: number
  sum: number
  day_sum: number
}

interface YunkonApiResponse {
  code: number
  data: YunkonNumber[]
  count: number
  totalRow: {
    id: string
    day_sum: string
    sum: string
  }
}

class YunkonUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YunkonUpstreamError'
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { ticket_link } = body

    if (!ticket_link) {
      return NextResponse.json({ success: false, error: 'ticket_link is required' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(ticket_link)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
    }

    const host = parsedUrl.origin
    const token = parsedUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json({ success: false, error: 'No token found in ticket_link' }, { status: 400 })
    }

    const limit = 100

    const fetchPage = async (page: number): Promise<YunkonApiResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        is_repet: '1',
        id: '',
        class_id: '',
        start_time: '',
        end_time: '',
      })
      const apiUrl = `${host}/share/share/api_yinliu_count.html?${params.toString()}`

      const response = await fetch(apiUrl, {
        headers: {
          Cookie: `share_token=${token}`,
        },
        redirect: 'follow',
      })

      if (!response.ok) {
        throw new YunkonUpstreamError(`Yunkon API error: ${response.status}`)
      }

      const json: YunkonApiResponse = await response.json()

      if (json.code !== 0) {
        throw new YunkonUpstreamError(`Yunkon returned error code: ${json.code}`)
      }

      return json
    }

    // Fetch first page to determine total count and pages
    const firstPage = await fetchPage(1)
    const totalCount = firstPage.count || 0
    const totalSum = firstPage.totalRow?.sum ?? '0'
    const totalDaySum = firstPage.totalRow?.day_sum ?? '0'
    const totalPages = Math.ceil(totalCount / limit)

    const allNumbers: YunkonNumber[] = [...(firstPage.data || [])]

    // Fetch remaining pages concurrently
    if (totalPages > 1) {
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const results = await Promise.all(pageNumbers.map((p) => fetchPage(p)))
      for (const res of results) {
        allNumbers.push(...(res.data || []))
      }
    }

    const onlineCount = allNumbers.filter((n) => n.online === 1).length
    const offlineCount = allNumbers.filter((n) => n.online !== 1).length

    return NextResponse.json({
      success: true,
      data: {
        numbers: allNumbers,
        total_count: totalCount,
        total_sum: Number(totalSum),
        total_day_sum: Number(totalDaySum),
        online_count: onlineCount,
        offline_count: offlineCount,
      },
    })
  } catch (error) {
    const isUpstream = error instanceof YunkonUpstreamError
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[yunkon sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: isUpstream ? 502 : 500 }
    )
  }
}
