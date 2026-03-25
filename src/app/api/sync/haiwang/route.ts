import { NextRequest, NextResponse } from 'next/server'

const HAIWANG_API_KEY = process.env.HAIWANG_API_KEY ?? '6bd1257667ce007b42b4236a08de1776'

interface HaiwangItem {
  acclist_id: number
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

interface HaiwangRenderResponse {
  code: number
  msg: string
  data: {
    shareid?: number
    share_id?: number
    id?: number
    [key: string]: unknown
  }
}

class HaiwangUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HaiwangUpstreamError'
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

    const headers = {
      'x-api-key': HAIWANG_API_KEY,
      'accept': 'application/json, text/plain, */*',
    }

    // Step 1: Call render API to get shareid
    const renderUrl = `https://admin.haiwangweb.com/webApi/accountshow/render?sharekey=${encodeURIComponent(sharekey)}`
    const renderResponse = await fetch(renderUrl, { headers })

    if (!renderResponse.ok) {
      throw new HaiwangUpstreamError(`Haiwang render API error: ${renderResponse.status}`)
    }

    const renderJson: HaiwangRenderResponse = await renderResponse.json()

    if (renderJson.code !== 1) {
      throw new HaiwangUpstreamError(`Haiwang render returned error code: ${renderJson.code}`)
    }

    // Per the render API spec, shareid may be nested under different field names.
    // Fall back to empty string so the list API can still be attempted without a shareid.
    const shareid: number | string =
      renderJson.data?.shareid ?? renderJson.data?.share_id ?? renderJson.data?.id ?? ''

    // Step 2: Paginate through all results
    const limit = 100

    const fetchPage = async (page: number): Promise<HaiwangListResponse> => {
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
      const apiUrl = `https://admin.haiwangweb.com/webApi/accountshow/list?${params.toString()}`

      const response = await fetch(apiUrl, { headers })

      if (!response.ok) {
        throw new HaiwangUpstreamError(`Haiwang list API error: ${response.status}`)
      }

      const json: HaiwangListResponse = await response.json()

      if (json.code !== 1) {
        throw new HaiwangUpstreamError(`Haiwang list returned error code: ${json.code}`)
      }

      return json
    }

    // Fetch first page to determine total and pages
    const firstPage = await fetchPage(1)
    const totalCount = firstPage.data?.total || 0
    const totalPages = Math.ceil(totalCount / limit)

    const allItems: HaiwangItem[] = [...(firstPage.data?.items || [])]

    // Fetch remaining pages concurrently
    if (totalPages > 1) {
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const results = await Promise.all(pageNumbers.map((p) => fetchPage(p)))
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
