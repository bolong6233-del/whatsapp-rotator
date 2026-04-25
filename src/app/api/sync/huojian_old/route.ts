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

/**
 * --------------------------------------------------------------
 * 🚀 火箭云控(旧版) 字段语义补充说明（2026-04 实测）
 * --------------------------------------------------------------
 * 上游 response 提供了"含重复"和"重粉数"两组字段：
 *   addCount     = 总进线（含重复）        repCount     = 总重粉
 *   addCountNow  = 当日进线（含重复）      repCountNow  = 当日重粉
 *
 * 火箭管理后台 UI 显示的"去重值"是前端算的：
 *   去重总进线 = addCount - repCount
 *   去重当日进线 = addCountNow - repCountNow
 *
 * 本路由统一使用"去重值"映射到 SyncNumber，与火箭后台 UI 保持一致。
 * 这意味着 download_ratio 自动停号也基于去重后的当日进线。
 * --------------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface HuojianOldRow {
  id: number
  csName: string
  username: string
  onlineType: number
  addCount: number
  addCountNow: number
  repCount: number | null | undefined
  repCountNow: number | null | undefined
}

interface HuojianOldListResponse {
  total: number
  rows: HuojianOldRow[]
  code: number
  msg: string
}

interface HuojianOldApiResponse {
  shareInfo: { id: number; endTime: string }
  addCount: number
  addCountNow: number
  repCount: number | null | undefined
  repCountNow: number | null | undefined
  list: HuojianOldListResponse
  nowDayReset: string
}

class HuojianOldUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HuojianOldUpstreamError'
  }
}

const HUOJIAN_OLD_BASE = 'https://v3.url66.me'
const PAGE_SIZE = 200

/**
 * 通过 Cloudflare Workers 代理转发请求到 v3.url66.me。
 * 直连会被 Cloudflare 以 403 拒绝（Vercel 数据中心 IP 段在拦截名单里）。
 * 注意：这个函数仅服务"火箭云控(旧版)"，不要被其他平台调用，也不要去复用海王的 proxyFetch。
 */
async function huojianOldProxyFetch(targetUrl: string): Promise<Response> {
  const proxyUrl = process.env.HUOJIAN_OLD_PROXY_URL
  const proxySecret = process.env.HUOJIAN_OLD_PROXY_SECRET

  // 没配代理就走直连（本地开发友好）
  if (!proxyUrl || !proxySecret) {
    return fetch(targetUrl, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'referer': 'https://v3.url66.me/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
      },
    })
  }

  // 走代理（仿海王的 POST {url, method, headers} 协议，但不复用其代码）
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-secret': proxySecret,
    },
    body: JSON.stringify({
      url: targetUrl,
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'referer': 'https://v3.url66.me/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
      },
    }),
  })

  if (res.status === 401 || res.status === 403) {
    throw new HuojianOldUpstreamError(`代理认证失败：${res.status}（请检查 HUOJIAN_OLD_PROXY_SECRET）`)
  }
  if (res.status >= 500) {
    throw new HuojianOldUpstreamError(`代理服务器错误：${res.status}`)
  }
  return res
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { ticket_link, password } = body

    if (!ticket_link) {
      return NextResponse.json({ success: false, error: 'ticket_link is required' }, { status: 400 })
    }

    // Parse shareId from ticket_link: https://v3.url66.me/s?id={shareId}
    let parsedUrl: URL
    try {
      parsedUrl = new URL(ticket_link)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
    }

    const shareId = parsedUrl.searchParams.get('id')
    if (!shareId) {
      return NextResponse.json({ success: false, error: '无法从 ticket_link 中解析 shareId（需要 ?id= 参数）' }, { status: 400 })
    }

    const sharePassword: string = password ?? ''
    if (!sharePassword) {
      return NextResponse.json({ success: false, error: '火箭云控(旧版)需要分享密码，请在工单上填写 password 字段' }, { status: 400 })
    }

    const fetchPage = async (pageNum: number): Promise<HuojianOldApiResponse> => {
      const params = new URLSearchParams({
        shareId,
        sharePassword,
        pageNum: String(pageNum),
        pageSize: String(PAGE_SIZE),
        isDelete: '0',
      })
      const apiUrl = `${HUOJIAN_OLD_BASE}/prod-api1/biz/link/share?${params.toString()}`

      const response = await huojianOldProxyFetch(apiUrl)

      if (!response.ok) {
        throw new HuojianOldUpstreamError(`火箭云控(旧版) API error: ${response.status}`)
      }

      const json: HuojianOldApiResponse = await response.json()

      if (json.list?.code !== 200) {
        throw new HuojianOldUpstreamError(`火箭云控(旧版) returned error code: ${json.list?.code} - ${json.list?.msg}`)
      }

      return json
    }

    // Fetch first page to determine total count and pages
    const firstPage = await fetchPage(1)
    const totalCount = firstPage.list.total || 0
    const totalSum = Math.max(0, (firstPage.addCount ?? 0) - (firstPage.repCount ?? 0))
    const totalDaySum = Math.max(0, (firstPage.addCountNow ?? 0) - (firstPage.repCountNow ?? 0))
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const allRows: HuojianOldRow[] = [...(firstPage.list.rows || [])]

    // Fetch remaining pages concurrently
    if (totalPages > 1) {
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const results = await Promise.all(pageNumbers.map((p) => fetchPage(p)))
      for (const res of results) {
        allRows.push(...(res.list.rows || []))
      }
    }

    // Map to SyncNumber-compatible format
    const numbers = allRows.map((row) => ({
      id: row.id,
      nickname: row.csName,
      user: row.username,
      online: row.onlineType === 1 ? 1 : 0,
      sum: Math.max(0, (row.addCount ?? 0) - (row.repCount ?? 0)),
      day_sum: Math.max(0, (row.addCountNow ?? 0) - (row.repCountNow ?? 0)),
    }))

    const onlineCount = numbers.filter((n) => n.online === 1).length
    const offlineCount = numbers.length - onlineCount

    return NextResponse.json({
      success: true,
      data: {
        numbers,
        total_count: totalCount,
        total_sum: totalSum,
        total_day_sum: totalDaySum,
        online_count: onlineCount,
        offline_count: offlineCount,
      },
    })
  } catch (error) {
    const isUpstream = error instanceof HuojianOldUpstreamError
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[huojian_old sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: isUpstream ? 502 : 500 }
    )
  }
}
