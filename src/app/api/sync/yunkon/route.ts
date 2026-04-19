/**
 * ⚠️ 星河云控专用同步接口 - 请勿修改
 *
 * 本文件仅处理星河云控平台的数据同步逻辑。
 * 接入新平台时，请在 src/app/api/sync/ 下创建新的目录和 route.ts，
 * 不要修改本文件的任何代码。
 *
 * 每个云控平台的 API 格式、认证方式、返回结构都不同，
 * 必须作为独立模块实现。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

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

class YunkonUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YunkonUpstreamError'
  }
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
        throw new YunkonUpstreamError(`Yunkon API error: ${response.status}`)
      }

      const json: YunkonApiResponse = await response.json()

      if (json.code !== 0) {
        throw new YunkonUpstreamError(`Yunkon returned error code: ${json.code}`)
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
    const isUpstream = error instanceof YunkonUpstreamError
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[yunkon sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: isUpstream ? 502 : 500 }
    )
  }
}
