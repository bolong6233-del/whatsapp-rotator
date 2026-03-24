import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const A2C_HOST = 'https://user.a2c.chat'

interface A2CDetailData {
  id: string
  name: string
  newFollowers: number
  newFollowersToday: number
  duplicateFollowers: number
  duplicateFollowersToday: number
  totalAccounts: number | null
  totalOnlineAccounts: number | null
}

interface A2CDetailResponse {
  code: number
  msg: string
  data: A2CDetailData
}

interface A2CListRow {
  id: string
  account: string
  seatName: string | null
  newFollowers: number
  newFollowersToday: number
  duplicateFollowers: number
  duplicateFollowersToday: number
  online: number
  status: number
  distributeStatus: number
}

interface A2CListResponse {
  code: number
  msg: string
  data: {
    total: number
    rows: A2CListRow[]
  }
}

interface ExistingNumber {
  id: string
  phone_number: string
}

function a2cHeaders(): Record<string, string> {
  const clientId = process.env.A2C_CLIENT_ID
  if (!clientId) {
    throw new Error('A2C_CLIENT_ID environment variable is not configured')
  }
  return {
    'Content-Type': 'application/json;charset=UTF-8',
    'Clientid': clientId,
    'Content-Language': 'zh_CN',
    'Isencrypt': 'false',
  }
}

async function fetchA2CDetail(counterId: string): Promise<A2CDetailResponse> {
  const res = await fetch(`${A2C_HOST}/api/talk/counter/share/detail`, {
    method: 'POST',
    headers: a2cHeaders(),
    body: JSON.stringify({ counterId }),
  })
  if (!res.ok) {
    throw new Error(`A2C detail API error: ${res.status}`)
  }
  return res.json()
}

async function fetchA2CListPage(counterId: string, pageNum: number, pageSize: number): Promise<A2CListResponse> {
  const res = await fetch(`${A2C_HOST}/api/talk/counter/share/record/list`, {
    method: 'POST',
    headers: a2cHeaders(),
    body: JSON.stringify({ counterId, pageNum, pageSize }),
  })
  if (!res.ok) {
    throw new Error(`A2C list API error: ${res.status}`)
  }
  return res.json()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { work_order_id } = body

    if (!work_order_id) {
      return NextResponse.json({ success: false, error: 'work_order_id is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch work order
    const { data: workOrder, error: workOrderError } = await supabase
      .from('work_orders')
      .select('id, ticket_link, ticket_name, number_type, distribution_link_slug, total_quantity')
      .eq('id', work_order_id)
      .single()

    if (workOrderError || !workOrder) {
      return NextResponse.json({ success: false, error: '工单不存在' }, { status: 404 })
    }

    // Parse counterId from share URL: https://user.a2c.chat/visitors/counter/share?id=xxx
    let shareId: string | null = null
    try {
      const parsed = new URL(workOrder.ticket_link)
      shareId = parsed.searchParams.get('id')
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid ticket_link URL' }, { status: 400 })
    }

    if (!shareId) {
      return NextResponse.json({ success: false, error: 'No share id found in ticket_link' }, { status: 400 })
    }

    // Fetch detail
    const detailResp = await fetchA2CDetail(shareId)
    if (detailResp.code !== 200) {
      return NextResponse.json({ success: false, error: `A2C detail API: ${detailResp.msg}` }, { status: 502 })
    }

    const detail = detailResp.data

    // Fetch list (all pages)
    const pageSize = 100
    const firstPage = await fetchA2CListPage(shareId, 1, pageSize)
    if (firstPage.code !== 200) {
      return NextResponse.json({ success: false, error: `A2C list API: ${firstPage.msg}` }, { status: 502 })
    }

    const totalRows = firstPage.data.total
    const totalPages = Math.ceil(totalRows / pageSize)
    const allRows: A2CListRow[] = [...(firstPage.data.rows || [])]

    if (totalPages > 1) {
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const results = await Promise.allSettled(pageNumbers.map((p) => fetchA2CListPage(shareId!, p, pageSize)))
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'rejected') {
          throw new Error(`A2C list page ${pageNumbers[i]} fetch failed: ${result.reason}`)
        }
        allRows.push(...(result.value.data.rows || []))
      }
    }

    // Map to SyncNumber format
    const syncNumbers = allRows.map((row, idx) => ({
      id: idx + 1,
      user: row.account,
      nickname: row.seatName ?? '',
      online: row.online === 1 ? 1 : 0,
      sum: row.newFollowers,
      day_sum: row.newFollowersToday,
    }))

    const onlineCount = allRows.filter((r) => r.online === 1).length
    const offlineCount = allRows.filter((r) => r.online !== 1).length
    const totalSum = detail.newFollowers
    const totalDaySum = detail.newFollowersToday
    const totalCount = totalRows

    const now = new Date().toISOString()

    const updates: Record<string, unknown> = {
      sync_total_sum: totalSum,
      sync_total_day_sum: totalDaySum,
      sync_total_numbers: totalCount,
      sync_online_count: onlineCount,
      sync_offline_count: offlineCount,
      sync_numbers: syncNumbers,
      last_synced_at: now,
    }

    if (workOrder.total_quantity > 0 && totalSum >= workOrder.total_quantity) {
      updates.status = 'completed'
    }

    const { error: updateError } = await supabase
      .from('work_orders')
      .update(updates)
      .eq('id', work_order_id)

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    // Sync numbers to whatsapp_numbers table
    if (allRows.length > 0 && workOrder.distribution_link_slug) {
      const { data: linkData } = await supabase
        .from('short_links')
        .select('id')
        .eq('slug', workOrder.distribution_link_slug)
        .single()

      if (linkData) {
        const shortLinkId = linkData.id

        const { data: existingNums } = await supabase
          .from('whatsapp_numbers')
          .select('id, phone_number')
          .eq('short_link_id', shortLinkId)
          .eq('label', workOrder.ticket_name)

        const existingMap = new Map(
          (existingNums || []).map((n: ExistingNumber) => [n.phone_number, n.id])
        )

        const toInsert: Array<Record<string, unknown>> = []
        const toSetActive: string[] = []
        const toSetInactive: string[] = []

        for (let idx = 0; idx < allRows.length; idx++) {
          const row = allRows[idx]
          const isActive = row.online === 1
          const existingId = existingMap.get(row.account)
          if (existingId) {
            if (isActive) {
              toSetActive.push(existingId)
            } else {
              toSetInactive.push(existingId)
            }
          } else {
            toInsert.push({
              short_link_id: shortLinkId,
              phone_number: row.account,
              label: workOrder.ticket_name,
              platform: workOrder.number_type,
              is_active: isActive,
              sort_order: idx,
            })
          }
        }

        if (toInsert.length > 0) {
          await supabase.from('whatsapp_numbers').insert(toInsert)
        }
        if (toSetActive.length > 0) {
          await supabase.from('whatsapp_numbers').update({ is_active: true }).in('id', toSetActive)
        }
        if (toSetInactive.length > 0) {
          await supabase.from('whatsapp_numbers').update({ is_active: false }).in('id', toSetInactive)
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        numbers: syncNumbers,
        total_count: totalCount,
        total_sum: totalSum,
        total_day_sum: totalDaySum,
        online_count: onlineCount,
        offline_count: offlineCount,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error in A2C sync'
    console.error('[a2c sync] error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
