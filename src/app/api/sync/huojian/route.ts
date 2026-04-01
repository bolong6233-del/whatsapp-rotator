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

/**
 * Extract work order ID and API host from a URL's `link=` query parameter.
 * Returns null if the parameter is absent or has an invalid format.
 */
function extractWorkOrderId(url: string): { workOrderId: string; apiHost: string } | null {
  try {
    const parsed = new URL(url)
    const linkParam = parsed.searchParams.get('link')
    if (linkParam && /^[a-zA-Z0-9]+$/.test(linkParam)) {
      return { workOrderId: linkParam, apiHost: parsed.origin }
    }
  } catch {
    // not a valid URL
  }
  return null
}

/**
 * Returns true when the hostname must not be fetched server-side
 * (loopback, link-local, private RFC-1918 ranges, cloud metadata endpoints).
 * Prevents SSRF attacks via crafted redirect destinations.
 */
function isPrivateOrReservedHostname(hostname: string): boolean {
  // Strip port if present
  const host = hostname.replace(/:\d+$/, '').toLowerCase()
  if (host === 'localhost') return true

  // IPv4 private/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [, a, b] = ipv4.map(Number)
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 0) return true
  }

  // IPv6 loopback / link-local
  if (host === '::1' || host.startsWith('fe80:')) return true

  return false
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ticket_link, password } = body

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

    if (isPrivateOrReservedHostname(parsedTicketLink.hostname)) {
      return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
    }

    // Step 1: Try to extract work order ID directly from the provided URL (complete link format)
    let extracted = extractWorkOrderId(ticket_link)

    if (extracted) {
      console.log(`[huojian sync] Direct extraction — work order ID: ${extracted.workOrderId}`)
    } else {
      // Step 2: URL doesn't contain link= param (short link), try following HTTP redirects
      console.log(`[huojian sync] No link= param found, attempting redirect tracking from: ${ticket_link}`)
      let currentUrl = parsedTicketLink.href
      let finalUrl = parsedTicketLink.href
      const maxRedirects = 10

      for (let i = 0; i < maxRedirects; i++) {
        console.log(`[huojian sync] redirect step ${i}: ${currentUrl}`)
        let response: Response
        try {
          response = await fetch(currentUrl, { redirect: 'manual' })
        } catch {
          break
        }

        const status = response.status
        if (status >= 300 && status < 400) {
          const location = response.headers.get('location')
          if (!location) break
          // Handle relative URLs
          const nextUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href
          // Validate redirect destination uses HTTPS and is not a private/internal host (SSRF prevention)
          if (!nextUrl.startsWith('https://')) {
            return NextResponse.json({ success: false, error: 'Redirect destination must use HTTPS' }, { status: 502 })
          }
          try {
            const nextParsed = new URL(nextUrl)
            if (isPrivateOrReservedHostname(nextParsed.hostname)) {
              return NextResponse.json({ success: false, error: 'Redirect destination is not allowed' }, { status: 502 })
            }
          } catch {
            return NextResponse.json({ success: false, error: 'Redirect destination must use HTTPS' }, { status: 502 })
          }
          currentUrl = nextUrl
          finalUrl = currentUrl

          extracted = extractWorkOrderId(currentUrl)
          if (extracted) {
            console.log(`[huojian sync] Found work order ID from redirect: ${extracted.workOrderId}`)
            break
          }
        } else {
          // Not a redirect — reached the final destination
          finalUrl = currentUrl
          break
        }
      }

      console.log(`[huojian sync] final URL after redirect tracking: ${finalUrl}`)

      // If still no work order ID, the short link uses JS redirect which server-side fetch cannot follow
      if (!extracted) {
        console.error(`[huojian sync] Could not extract work order ID. Final URL: ${finalUrl}`)
        return NextResponse.json(
          {
            success: false,
            error:
              '无法解析工单链接。请在浏览器中打开短链接，等页面加载后复制地址栏的完整链接（格式如 v4.url66.me/gds?link=xxx）粘贴到工单链接中。',
          },
          { status: 400 }
        )
      }
    }

    const { workOrderId, apiHost } = extracted

    // Validate apiHost before using it (SSRF prevention — redundant but explicit)
    try {
      const apiHostParsed = new URL(apiHost)
      if (apiHostParsed.protocol !== 'https:' || isPrivateOrReservedHostname(apiHostParsed.hostname)) {
        return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
    }

    // Step 2: Call the Huojian API with password in the request body
    const apiUrl = `${apiHost}/prod-api1/biz/counter/link/share/${workOrderId}`
    console.log(`[huojian sync] Calling API: ${apiUrl}, password provided: ${!!password}`)
    if (!password) {
      console.warn('[huojian sync] No password provided — request may fail if the work order requires one')
    }

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify({
        password: password || '',
        accountLogin: '',
        accountStatus: '',
        csName: '',
        isDelete: 0,
        isEnable: '',
      }),
    })

    console.log(`[huojian sync] API response status: ${apiResponse.status}`)

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text().catch(() => '')
      console.error(`[huojian sync] API error response: ${errorText.substring(0, 500)}`)
      throw new HuojianUpstreamError(`Huojian API error: ${apiResponse.status}`)
    }

    const result: HuojianApiResponse = await apiResponse.json()
    console.log(`[huojian sync] API response code: ${result.code}`)

    if (result.code !== 0) {
      const hint = !password ? '（工单密码未填写，请检查是否需要密码）' : '（请检查工单密码是否正确）'
      throw new HuojianUpstreamError(`Huojian API 返回错误码: ${result.code}${hint}`)
    }

    // Step 3: Map Huojian data to the unified SyncNumber format
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
