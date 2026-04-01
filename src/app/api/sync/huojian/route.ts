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

    let parsedTicketLink: URL
    try {
      parsedTicketLink = new URL(ticket_link)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
    }

    if (parsedTicketLink.protocol !== 'https:') {
      return NextResponse.json({ success: false, error: 'ticket_link must use HTTPS' }, { status: 400 })
    }

    // Step 1: Follow ALL redirects manually, collecting cookies along the way
    let currentUrl = parsedTicketLink.href
    const allCookies: string[] = []
    let finalUrl = ''
    const maxRedirects = 10

    for (let i = 0; i < maxRedirects; i++) {
      console.log(`[huojian sync] redirect step ${i}: ${currentUrl}`)
      let response: Response
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          headers: allCookies.length > 0 ? { Cookie: allCookies.join('; ') } : {},
        })
      } catch {
        return NextResponse.json({ success: false, error: `Failed to fetch ticket_link at redirect step ${i}: ${currentUrl}` }, { status: 502 })
      }

      // Collect cookies from this response
      const setCookieHeaders = response.headers.getSetCookie
        ? response.headers.getSetCookie()
        : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : [])

      for (const cookie of setCookieHeaders) {
        allCookies.push(cookie.split(';')[0])
      }

      const status = response.status
      if (status >= 300 && status < 400) {
        const location = response.headers.get('location')
        if (!location) break
        // Handle relative URLs
        const nextUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href
        // Validate redirect destination uses HTTPS to prevent SSRF to internal resources
        if (!nextUrl.startsWith('https://')) {
          return NextResponse.json({ success: false, error: 'Redirect destination must use HTTPS' }, { status: 502 })
        }
        currentUrl = nextUrl
        finalUrl = currentUrl
      } else {
        // Not a redirect - we've reached the final destination
        finalUrl = currentUrl
        break
      }
    }

    console.log(`[huojian sync] final URL: ${finalUrl}`)
    console.log(`[huojian sync] collected cookies: ${allCookies.length}`)

    // Step 2: Extract the work order ID from the final URL (link= query param)
    let workOrderId: string | null = null
    try {
      const parsed = new URL(finalUrl)
      workOrderId = parsed.searchParams.get('link')
    } catch {
      console.error('[huojian sync] Failed to parse final URL:', finalUrl)
      // handled below
    }

    if (!workOrderId) {
      console.error('[huojian sync] Could not extract work order ID from final URL:', finalUrl)
      return NextResponse.json(
        { success: false, error: `Could not extract work order ID. Final URL: ${finalUrl}` },
        { status: 502 }
      )
    }

    // Validate work order ID to prevent path traversal / injection
    if (!/^[a-zA-Z0-9]+$/.test(workOrderId)) {
      return NextResponse.json({ success: false, error: 'Invalid work order ID format' }, { status: 502 })
    }

    // Step 3: If no cookies were collected during redirects, try fetching the gds page
    // The gds page may set authentication cookies needed for the API call
    if (allCookies.length === 0) {
      console.log('[huojian sync] No cookies from redirects, trying to fetch gds page...')
      const gdsUrl = `https://v4.url66.me/gds?link=${workOrderId}`
      try {
        const gdsResponse = await fetch(gdsUrl, { redirect: 'follow' })
        const gdsCookies = gdsResponse.headers.getSetCookie
          ? gdsResponse.headers.getSetCookie()
          : (gdsResponse.headers.get('set-cookie') ? [gdsResponse.headers.get('set-cookie')!] : [])

        for (const cookie of gdsCookies) {
          allCookies.push(cookie.split(';')[0])
        }
      } catch {
        console.warn('[huojian sync] Failed to fetch gds page for cookies')
        // Non-fatal: proceed without extra cookies
      }
      console.log(`[huojian sync] cookies after gds page: ${allCookies.length}`)
    }

    const cookieString = allCookies.join('; ')

    // Step 4: Call the Huojian API
    const apiUrl = `https://v4.url66.me/prod-api1/biz/counter/link/share/${workOrderId}`
    console.log(`[huojian sync] calling API: ${apiUrl}`)
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieString ? { Cookie: cookieString } : {}),
      },
    })

    console.log(`[huojian sync] API response status: ${apiResponse.status}`)

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text().catch(() => '')
      console.error(`[huojian sync] API error response: ${errorText}`)
      throw new HuojianUpstreamError(`Huojian API error: ${apiResponse.status}`)
    }

    const result: HuojianApiResponse = await apiResponse.json()
    console.log(`[huojian sync] API response code: ${result.code}`)

    if (result.code !== 0) {
      throw new HuojianUpstreamError(`Huojian returned error code: ${result.code}`)
    }

    // Step 5: Map Huojian data to the unified SyncNumber format
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
