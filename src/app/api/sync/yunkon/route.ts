import { NextRequest, NextResponse } from 'next/server'

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

export async function POST(request: NextRequest) {
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
        throw new Error(`Yunkon API error: ${response.status}`)
      }

      const json: YunkonApiResponse = await response.json()

      if (json.code !== 0) {
        throw new Error(`Yunkon returned error code: ${json.code}`)
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
    const message = error instanceof Error ? error.message : 'Internal server error'
    const isUpstream = message.startsWith('Yunkon')
    console.error('[yunkon sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: isUpstream ? 502 : 500 }
    )
  }
}
