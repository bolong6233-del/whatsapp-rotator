import { NextRequest, NextResponse } from 'next/server'

interface HuojianAccount {
  type: number
  csName: string
  accountLogin: string
  accountNickName: string | null
  accountAvatarUrl: string | null
  accountStatus: number
  newTodayFriend: number
  newTotalFriend: number
  duplicateTodayFriend: number
  duplicateTotalFriend: number
  duplicateRemovedTodayFriend: number
  duplicateRemoveFriend: number
  isEnable: number
}

interface HuojianApiResponse {
  code: number
  counterWorker: {
    id: number
    newTotalFriend: number
    newTodayFriend: number
    [key: string]: unknown
  }
  counterCsAccountVo: HuojianAccount[]
}

class HuojianUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HuojianUpstreamError'
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ticket_link } = body

    if (!ticket_link) {
      return NextResponse.json({ success: false, error: 'ticket_link is required' }, { status: 400 })
    }

    // Validate that ticket_link is from the expected short link domain
    let parsedTicketLink: URL
    try {
      parsedTicketLink = new URL(ticket_link)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
    }

    if (parsedTicketLink.hostname !== 's.url99.me') {
      return NextResponse.json(
        { success: false, error: 'ticket_link must be a s.url99.me short link' },
        { status: 400 }
      )
    }

    // Build the fetch URL from a hardcoded origin so only the path comes from user input
    const safeUrl = new URL(parsedTicketLink.pathname + parsedTicketLink.search, 'https://s.url99.me').href

    // Step 1: Follow the short link redirect manually to get the final URL and Cookie
    let redirectResponse: Response
    try {
      redirectResponse = await fetch(safeUrl, { redirect: 'manual' })
    } catch {
      return NextResponse.json({ success: false, error: 'Failed to fetch ticket_link' }, { status: 502 })
    }

    const location = redirectResponse.headers.get('location')
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'No redirect location found from short link' },
        { status: 502 }
      )
    }

    // Collect cookies from the redirect response
    const setCookieHeaders = redirectResponse.headers.getSetCookie
      ? redirectResponse.headers.getSetCookie()
      : (redirectResponse.headers.get('set-cookie') ? [redirectResponse.headers.get('set-cookie')!] : [])

    const cookieString = setCookieHeaders
      .map((c) => c.split(';')[0])
      .join('; ')

    // Step 2: Extract the work order ID from the final URL (link= query param)
    let finalUrl: URL
    try {
      finalUrl = new URL(location)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid redirect URL from short link' }, { status: 502 })
    }

    const workOrderId = finalUrl.searchParams.get('link')
    if (!workOrderId) {
      return NextResponse.json(
        { success: false, error: 'No link parameter found in redirect URL' },
        { status: 502 }
      )
    }

    // Validate work order ID to prevent path traversal / injection
    if (!/^[a-zA-Z0-9]+$/.test(workOrderId)) {
      return NextResponse.json({ success: false, error: 'Invalid work order ID format' }, { status: 502 })
    }

    // Step 3: Call the Huojian API
    const apiUrl = `https://v4.url66.me/prod-api1/biz/counter/link/share/${workOrderId}`
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        ...(cookieString ? { Cookie: cookieString } : {}),
      },
    })

    if (!apiResponse.ok) {
      throw new HuojianUpstreamError(`Huojian API error: ${apiResponse.status}`)
    }

    const result: HuojianApiResponse = await apiResponse.json()

    if (result.code !== 0) {
      throw new HuojianUpstreamError(`Huojian returned error code: ${result.code}`)
    }

    // Step 4: Map Huojian data to the unified SyncNumber format
    const accounts = result.counterCsAccountVo || []
    const numbers = accounts.map((n) => ({
      id: n.accountLogin,
      user: n.accountLogin,
      nickname: n.accountNickName,
      online: n.accountStatus,
      sum: n.newTotalFriend,
      day_sum: n.newTodayFriend,
    }))

    const totalSum = result.counterWorker.newTotalFriend
    const totalDaySum = result.counterWorker.newTodayFriend
    const totalCount = accounts.length
    const onlineCount = accounts.filter((n) => n.accountStatus === 1).length
    const offlineCount = accounts.filter((n) => n.accountStatus !== 1).length

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
    const isUpstream = error instanceof HuojianUpstreamError
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[huojian sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: isUpstream ? 502 : 500 }
    )
  }
}
