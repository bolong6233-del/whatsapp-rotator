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
    let page = 1
    const allNumbers: YunkonNumber[] = []
    let totalCount = 0
    let totalSum = '0'
    let totalDaySum = '0'

    while (true) {
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
        return NextResponse.json(
          { success: false, error: `Yunkon API error: ${response.status}` },
          { status: 502 }
        )
      }

      const json: YunkonApiResponse = await response.json()

      if (json.code !== 0) {
        return NextResponse.json(
          { success: false, error: `Yunkon returned error code: ${json.code}` },
          { status: 502 }
        )
      }

      allNumbers.push(...(json.data || []))
      totalCount = json.count || 0
      totalSum = json.totalRow?.sum ?? '0'
      totalDaySum = json.totalRow?.day_sum ?? '0'

      // If we've loaded all records, stop
      if (allNumbers.length >= totalCount || !json.data || json.data.length < limit) {
        break
      }

      page++
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
    console.error('[yunkon sync] error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
