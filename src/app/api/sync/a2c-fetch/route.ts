import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT_MS = 10_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

interface ParsedNumber {
  phone: string
  seat: string
  status: string
  stat_status: string
  day_done: number
  day_goal: number
  total_done: number
  total_goal: number
}

/** Extract plain text from an HTML snippet by discarding tag content. */
function cellText(html: string): string {
  let result = ''
  let inTag = false
  for (const ch of html) {
    if (ch === '<') { inTag = true; continue }
    if (ch === '>') { inTag = false; continue }
    if (!inTag) result += ch
  }
  return result.trim()
}

function parseTableFromHtml(html: string): ParsedNumber[] {
  const numbers: ParsedNumber[] = []

  // Find all <tbody> blocks
  const tbodyRegex = /<tbody[^>]*>([\s\S]*?)<\/tbody>/gi
  let tbodyMatch: RegExpExecArray | null
  while ((tbodyMatch = tbodyRegex.exec(html)) !== null) {
    const tbodyHtml = tbodyMatch[1]

    // Find all <tr> rows within tbody
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(tbodyHtml)) !== null) {
      const rowHtml = rowMatch[1]

      // Prefer .cell divs (Element UI pattern)
      const cellDivRegex = /<div[^>]*class="[^"]*\bcell\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      const cellDivMatches: string[] = []
      let cellMatch: RegExpExecArray | null
      while ((cellMatch = cellDivRegex.exec(rowHtml)) !== null) {
        cellDivMatches.push(cellText(cellMatch[1]))
      }

      let cells = cellDivMatches
      if (cells.length < 6) {
        // Fallback: use <td> content
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
        const tdMatches: string[] = []
        let tdMatch: RegExpExecArray | null
        while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
          tdMatches.push(cellText(tdMatch[1]))
        }
        cells = tdMatches
      }

      if (cells.length < 6) continue

      const phone = cells[0] || ''
      if (!phone || !/\d/.test(phone)) continue // skip rows without a phone number

      const seat = cells[1] || ''
      const status = cells[2] || ''
      const stat_status = cells[3] || ''

      const dayParts = (cells[4] || '').split('/').map(s => parseInt(s.trim()) || 0)
      const totalParts = (cells[5] || '').split('/').map(s => parseInt(s.trim()) || 0)

      numbers.push({
        phone,
        seat,
        status,
        stat_status,
        day_done: dayParts[0] ?? 0,
        day_goal: dayParts[1] ?? 0,
        total_done: totalParts[0] ?? 0,
        total_goal: totalParts[1] ?? 0,
      })
    }
    if (numbers.length > 0) break // stop after first tbody that yielded data
  }

  return numbers
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { work_order_id, ticket_link } = body as { work_order_id?: string; ticket_link?: string }

    if (!work_order_id || !ticket_link) {
      return NextResponse.json(
        { success: false, error: 'work_order_id and ticket_link are required' },
        { status: 400 }
      )
    }

    // Fetch the A2C sharing page server-side
    let html: string
    try {
      const fetchRes = await fetch(ticket_link, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (!fetchRes.ok) {
        return NextResponse.json(
          { success: false, error: `获取 A2C 页面失败：HTTP ${fetchRes.status}` },
          { status: 502 }
        )
      }

      html = await fetchRes.text()
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : '网络错误'
      return NextResponse.json(
        { success: false, error: `无法访问 A2C 页面：${msg}` },
        { status: 502 }
      )
    }

    // Parse HTML to extract table rows
    const numbers = parseTableFromHtml(html)

    if (numbers.length === 0) {
      return NextResponse.json(
        { success: false, error: '页面解析失败：未找到号码数据（页面可能需要登录或由 JavaScript 动态加载）' },
        { status: 422 }
      )
    }

    // Compute aggregate stats
    const total_count = numbers.length
    const total_day_sum = numbers.reduce((s, n) => s + n.day_done, 0)
    const total_sum = numbers.reduce((s, n) => s + n.total_done, 0)
    const online_count = numbers.filter(n => n.status === '有效').length
    const offline_count = numbers.filter(n => n.status !== '有效').length

    // Call the internal A2C sync endpoint
    const origin = request.nextUrl.origin
    const syncRes = await fetch(`${origin}/api/sync/a2c`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_order_id,
        total_count,
        numbers,
        total_day_sum,
        total_sum,
        online_count,
        offline_count,
      }),
    })

    const syncResult = await syncRes.json()

    if (!syncResult.success) {
      return NextResponse.json(
        { success: false, error: syncResult.error || '同步失败' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: syncResult.data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('[a2c-fetch] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
