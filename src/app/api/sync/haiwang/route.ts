import { NextRequest, NextResponse } from 'next/server'

const HAIWANG_API_KEY = process.env.HAIWANG_API_KEY ?? '6bd1257667ce007b42b4236a08de1776'

// Cloudflare Worker proxy configuration
// All requests to admin.haiwangweb.com are routed through the Worker to bypass Cloudflare 403.
// Set HAIWANG_WORKER_PROXY_URL and HAIWANG_WORKER_PROXY_SECRET in your environment to override.
const WORKER_PROXY_URL = process.env.HAIWANG_WORKER_PROXY_URL ?? 'https://haiwang-proxy.bolong6233.workers.dev/'
const WORKER_PROXY_SECRET = process.env.HAIWANG_WORKER_PROXY_SECRET ?? 'haiwang-proxy-secret-key-2026'

class HaiwangUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HaiwangUpstreamError'
  }
}

/**
 * Proxy a request through the Cloudflare Worker to avoid Cloudflare 403 on admin.haiwangweb.com.
 * Worker API: POST {WORKER_PROXY_URL} with header x-proxy-secret and body { url, method, headers, jsonBody }
 */
async function fetchViaProxy(
  url: string,
  options: { method?: string; headers?: Record<string, string>; jsonBody?: unknown } = {},
): Promise<Response> {
  const response = await fetch(WORKER_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-secret': WORKER_PROXY_SECRET,
    },
    body: JSON.stringify({
      url,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      ...(options.jsonBody !== undefined ? { jsonBody: options.jsonBody } : {}),
    }),
  })
  if (response.status === 401) {
    throw new HaiwangUpstreamError('Worker proxy authentication failed: invalid x-proxy-secret')
  }
  if (response.status === 400) {
    const text = await response.text()
    throw new HaiwangUpstreamError(`Worker proxy bad request: ${text}`)
  }
  return response
}

interface HaiwangItem {
  acclist_id: number
  acclist_shareid: number
  acclist_account: string
  acclist_nickname: string
  acclist_status: number
  account_statistics_today_effective: number
  account_statistics_history_effective: number
  acclist_logined: string
}

interface HaiwangShareStatistics {
  sharecode_statistics_total_account: number
  sharecode_statistics_online_account: number
  sharecode_statistics_total_contact_effective: number
  sharecode_statistics_today_contact_effective: number
}

interface HaiwangListResponse {
  code: number
  msg: string
  data: {
    total: number
    items: HaiwangItem[]
    shareStatistics: HaiwangShareStatistics
  }
}

function extractSharekey(ticketLink: string): string | null {
  // The link format is: https://admin.haiwangweb.com/web#/accountshow/{sharekey}
  // The hash fragment is not parsed by URL constructor on the server, so we parse it manually.
  const marker = '/accountshow/'
  const idx = ticketLink.indexOf(marker)
  if (idx === -1) return null
  const after = ticketLink.slice(idx + marker.length)
  // Remove any trailing query string or hash fragments
  return after.split('?')[0].split('#')[0] || null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ticket_link } = body

    if (!ticket_link) {
      return NextResponse.json({ success: false, error: 'ticket_link is required' }, { status: 400 })
    }

    const sharekey = extractSharekey(ticket_link)
    if (!sharekey) {
      return NextResponse.json({ success: false, error: 'No sharekey found in ticket_link' }, { status: 400 })
    }

    const headers: Record<string, string> = {
      'x-api-key': HAIWANG_API_KEY,
      'accept': 'application/json, text/plain, */*',
    }

    const limit = 100

    // Helper to build list API URL
    const buildListUrl = (page: number, shareid: string | number) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
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
      return `https://admin.haiwangweb.com/webApi/accountshow/list?${params.toString()}`
    }

    const fetchPage = async (page: number, shareid: string | number): Promise<HaiwangListResponse> => {
      const apiUrl = buildListUrl(page, shareid)
      const response = await fetchViaProxy(apiUrl, { headers })

      if (!response.ok) {
        throw new HaiwangUpstreamError(`Haiwang list API error: ${response.status}`)
      }

      const json: HaiwangListResponse = await response.json()

      if (json.code !== 1) {
        throw new HaiwangUpstreamError(`Haiwang list returned error code: ${json.code}, msg: ${json.msg}`)
      }

      return json
    }

    // Step 1: Try fetching the first page WITHOUT shareid
    // The list API may work with just sharekey, or we can extract shareid from the response
    let shareid: string | number = ''

    const firstPage = await fetchPage(1, '')

    // Extract shareid from first item if available, for subsequent page requests
    if (firstPage.data?.items?.length > 0 && firstPage.data.items[0].acclist_shareid) {
      shareid = firstPage.data.items[0].acclist_shareid
    } else {
      console.warn('[haiwang sync] acclist_shareid not found in first item; subsequent pages will be requested without shareid')
    }

    // Step 2: Paginate through all results
    const totalCount = firstPage.data?.total || 0
    const totalPages = Math.ceil(totalCount / limit)

    const allItems: HaiwangItem[] = [...(firstPage.data?.items || [])]

    // Fetch remaining pages concurrently
    if (totalPages > 1) {
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const results = await Promise.all(pageNumbers.map((p) => fetchPage(p, shareid)))
      for (const res of results) {
        allItems.push(...(res.data?.items || []))
      }
    }

    // Use shareStatistics from the first page for summary data
    const shareStatistics = firstPage.data?.shareStatistics

    const totalSum = shareStatistics?.sharecode_statistics_total_contact_effective ?? 0
    const totalDaySum = shareStatistics?.sharecode_statistics_today_contact_effective ?? 0
    const onlineCount = shareStatistics?.sharecode_statistics_online_account ?? allItems.filter((n) => n.acclist_status === 2).length
    const offlineCount = totalCount - onlineCount

    // Map items to SyncNumber format
    const numbers = allItems.map((item) => ({
      id: item.acclist_id,
      nickname: item.acclist_nickname,
      user: item.acclist_account,
      online: item.acclist_status === 2 ? 1 : 0,
      sum: item.account_statistics_history_effective,
      day_sum: item.account_statistics_today_effective,
    }))

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
    const isUpstream = error instanceof HaiwangUpstreamError
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[haiwang sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: isUpstream ? 502 : 500 }
    )
  }
}
