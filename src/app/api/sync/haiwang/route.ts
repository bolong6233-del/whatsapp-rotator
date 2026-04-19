/**
 * ⚠️ 海王云控专用同步接口
 *
 * 本文件仅处理海王云控平台的数据同步逻辑。
 * 不要修改 src/app/api/sync/yunkon/route.ts（星河云控）的任何代码。
 * 不要修改 src/app/api/sync/a2c/route.ts（A2C云控）的任何代码。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'edge'
interface HaiwangItem {
  acclist_id: number
  acclist_account: string
  acclist_username: string
  acclist_nickname: string
  acclist_status: number
  account_statistics_history_total: number
  account_statistics_history_effective: number
  account_statistics_today_total: number
  account_statistics_today_effective: number
}

interface HaiwangShareStatistics {
  sharecode_statistics_total_account: number
  sharecode_statistics_total_contact: number
  sharecode_statistics_total_contact_effective: number
  sharecode_statistics_online_account: number
  sharecode_statistics_today_contact: number
  sharecode_statistics_today_contact_effective: number
}

interface HaiwangListResponse {
  code: number
  msg: string
  data: {
    items: HaiwangItem[]
    total: number
    shareStatistics: HaiwangShareStatistics
  }
}

interface HaiwangRenderResponse {
  code: number
  msg: string
  data: {
    shareid: number
    sharepass: string
  }
}

class HaiwangUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HaiwangUpstreamError'
  }
}

const HAIWANG_BASE = 'https://admin.haiwangweb.com'
const LIST_LIMIT = 150

// Cloudflare blocks plain server-side fetch calls to admin.haiwangweb.com with 403.
// These headers mimic a legitimate browser request to bypass that protection.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Referer': 'https://admin.haiwangweb.com/web',
  'Origin': 'https://admin.haiwangweb.com',
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

    // Parse sharekey from URL fragment: https://admin.haiwangweb.com/web#/accountshow/{sharekey}
    const hashMatch = (ticket_link as string).match(/#\/accountshow\/([^/?#]+)/)
    if (!hashMatch) {
      return NextResponse.json({ success: false, error: 'Cannot parse sharekey from ticket_link' }, { status: 400 })
    }
    const sharekey = hashMatch[1]

    // Step 1: Get shareid from render API
    const renderUrl = `${HAIWANG_BASE}/webApi/accountshow/render?sharekey=${encodeURIComponent(sharekey)}`
    const renderRes = await fetch(renderUrl, { headers: BROWSER_HEADERS })
    if (!renderRes.ok) {
      throw new HaiwangUpstreamError(`Haiwang render API error: ${renderRes.status}`)
    }
    const renderJson: HaiwangRenderResponse = await renderRes.json()
    if (renderJson.code !== 1) {
      throw new HaiwangUpstreamError(`Haiwang render returned error code: ${renderJson.code}`)
    }
    const shareid = renderJson.data.shareid

    // Step 2: Fetch first page to get total count
    const fetchPage = async (page: number): Promise<HaiwangListResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIST_LIMIT),
        sort: 'acclist_id DESC',
        SortTop: '[0]',
        SortType: '["acclist_logined"]',
        sharecode: sharekey,
        sharekey: sharekey,
        shareid: String(shareid),
        password: '',
        onlineTop: '0',
        todayTop: '0',
        idTop: '0',
        AcclistAppid: '',
      })
      const apiUrl = `${HAIWANG_BASE}/webApi/accountshow/list?${params.toString()}`
      const res = await fetch(apiUrl, { headers: BROWSER_HEADERS })
      if (!res.ok) {
        throw new HaiwangUpstreamError(`Haiwang list API error: ${res.status}`)
      }
      const json: HaiwangListResponse = await res.json()
      if (json.code !== 1) {
        throw new HaiwangUpstreamError(`Haiwang list returned error code: ${json.code}`)
      }
      return json
    }

    const firstPage = await fetchPage(1)
    const totalCount = firstPage.data.total || 0
    const shareStatistics = firstPage.data.shareStatistics
    const totalPages = Math.ceil(totalCount / LIST_LIMIT)

    const allItems: HaiwangItem[] = [...(firstPage.data.items || [])]

    // Fetch remaining pages concurrently
    if (totalPages > 1) {
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const results = await Promise.all(pageNumbers.map((p) => fetchPage(p)))
      for (const res of results) {
        allItems.push(...(res.data.items || []))
      }
    }

    // Map to SyncNumber-compatible format
    const numbers = allItems.map((item) => ({
      id: item.acclist_id,
      nickname: item.acclist_nickname,
      user: item.acclist_account,
      online: item.acclist_status === 2 ? 1 : 0,
      sum: item.account_statistics_history_total,
      day_sum: item.account_statistics_today_total,
    }))

    const onlineCount = numbers.filter((n) => n.online === 1).length
    const offlineCount = numbers.filter((n) => n.online !== 1).length

    return NextResponse.json({
      success: true,
      data: {
        numbers,
        total_count: shareStatistics?.sharecode_statistics_total_account ?? totalCount,
        total_sum: shareStatistics?.sharecode_statistics_total_contact ?? 0,
        total_day_sum: shareStatistics?.sharecode_statistics_today_contact ?? 0,
        online_count: shareStatistics?.sharecode_statistics_online_account ?? onlineCount,
        offline_count: offlineCount,
      },
    })
  } catch (error) {
    const isUpstream = error instanceof HaiwangUpstreamError
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[haiwang sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: isUpstream ? 502 : 500 }
    )
  }
}
