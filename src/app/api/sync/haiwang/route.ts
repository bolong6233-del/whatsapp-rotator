/**
 * ⚠️ 海王云控专用同步接口
 *
 * 本文件仅处理海王云控平台的数据同步逻辑。
 * 不要修改 src/app/api/sync/yunkon/route.ts（星河云控）的任何代码。
 * 不要修改 src/app/api/sync/a2c/route.ts（A2C云控）的任何代码。
 */

import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
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
const HAIWANG_SIGN_SALT = 'gcG7LnEwlS_7xJCvniqfAw2FfcaV1R230CRK977VD40&&&'
const HAIWANG_SIGN_SUFFIX = 'haiwang'

function buildHaiwangSignHeaders(): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  // MD5 is required by the Haiwang API signing protocol (reverse-engineered from their frontend)
  const xApiKey = createHash('md5')
    .update(HAIWANG_SIGN_SALT + timestamp + HAIWANG_SIGN_SUFFIX)
    .digest('hex')
  const sign = createHash('sha256').update(xApiKey + timestamp).digest('hex')
  return {
    'X-Timestamp': timestamp,
    'X-API-Key': xApiKey,
    'X-Custom-Sign': sign,
  }
}

async function proxyFetch(targetUrl: string): Promise<Response> {
  const proxyUrl = process.env.HAIWANG_PROXY_URL
  const proxySecret = process.env.HAIWANG_PROXY_SECRET

  if (!proxyUrl || !proxySecret) {
    throw new HaiwangUpstreamError('HAIWANG_PROXY_URL or HAIWANG_PROXY_SECRET not configured')
  }

  const signHeaders = buildHaiwangSignHeaders()
  const authHeader = process.env.HAIWANG_AUTH_TOKEN
    ? { Authorization: process.env.HAIWANG_AUTH_TOKEN }
    : {}

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
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'zh-CN,zh;q=0.9',
        'referer': 'https://admin.haiwangweb.com/web',
        'origin': 'https://admin.haiwangweb.com',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'useragent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'appversion': '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'platform': 'Win32',
        'vendor': 'Google Inc.',
        'lang': 'CN',
        'language': 'zh-CN',
        'screen': '1920x1080',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        ...signHeaders,
        ...authHeader,
      },
    }),
  })

  if (res.status === 401 || res.status === 403) {
    throw new HaiwangUpstreamError(`Proxy authentication failed: ${res.status}`)
  }
  if (res.status >= 500) {
    throw new HaiwangUpstreamError(`Proxy server error: ${res.status}`)
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
    const renderRes = await proxyFetch(renderUrl)
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
        SortTop: '[0,1]',
        SortType: '["acclist_logined","acclist_id"]',
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
      const res = await proxyFetch(apiUrl)
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
