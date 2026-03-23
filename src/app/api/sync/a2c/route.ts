import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface A2CNumber {
  phone: string
  seat: string
  status: string
  stat_status: string
  day_done: number
  day_goal: number
  total_done: number
  total_goal: number
}

interface A2CWebhookBody {
  work_order_id: string
  stats?: Record<string, unknown>
  total_count: number
  numbers: A2CNumber[]
  total_day_sum: number
  total_sum: number
  online_count: number
  offline_count: number
}

interface ExistingNumber {
  id: string
  phone_number: string
}

export async function POST(request: NextRequest) {
  try {
    const body: A2CWebhookBody = await request.json()
    const { work_order_id, numbers, total_count, total_day_sum, total_sum, online_count, offline_count } = body

    if (!work_order_id) {
      return NextResponse.json({ success: false, error: 'work_order_id is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Validate work order exists
    const { data: workOrder, error: workOrderError } = await supabase
      .from('work_orders')
      .select('id, distribution_link_slug, ticket_name, number_type, total_quantity')
      .eq('id', work_order_id)
      .single()

    if (workOrderError || !workOrder) {
      return NextResponse.json({ success: false, error: '工单不存在' }, { status: 404 })
    }

    // Map A2C numbers to SyncNumber-compatible format
    const syncNumbers = (numbers || []).map((num, idx) => ({
      id: idx + 1,
      user: num.phone,
      nickname: num.seat,
      online: num.status === '有效' ? 1 : 0,
      sum: num.total_done,
      day_sum: num.day_done,
    }))

    const now = new Date().toISOString()

    // Build update payload
    const updates: Record<string, unknown> = {
      sync_total_sum: total_sum,
      sync_total_day_sum: total_day_sum,
      sync_total_numbers: total_count,
      sync_online_count: online_count,
      sync_offline_count: offline_count,
      sync_numbers: syncNumbers,
      last_synced_at: now,
    }

    // Auto-complete when total_sum reaches threshold
    if (workOrder.total_quantity > 0 && total_sum >= workOrder.total_quantity) {
      updates.status = 'completed'
    }

    // Persist sync results to work order
    const { error: updateError } = await supabase
      .from('work_orders')
      .update(updates)
      .eq('id', work_order_id)

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    // Push numbers to whatsapp_numbers
    if (numbers && numbers.length > 0 && workOrder.distribution_link_slug) {
      const { data: linkData } = await supabase
        .from('short_links')
        .select('id')
        .eq('slug', workOrder.distribution_link_slug)
        .single()

      if (linkData) {
        const shortLinkId = linkData.id

        // Fetch existing numbers for this work order
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

        for (let idx = 0; idx < numbers.length; idx++) {
          const num = numbers[idx]
          const isActive = num.status === '有效'
          const existingId = existingMap.get(num.phone)
          if (existingId) {
            if (isActive) {
              toSetActive.push(existingId)
            } else {
              toSetInactive.push(existingId)
            }
          } else {
            toInsert.push({
              short_link_id: shortLinkId,
              phone_number: num.phone,
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
        total_count,
        total_sum,
        total_day_sum,
        online_count,
        offline_count,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error in A2C sync handler'
    console.error('[a2c sync] error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
