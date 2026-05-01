import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '未找到' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const body = await request.json()
  const { id } = await params

  // Allow updating any subset of fields
  const allowedFields = [
    'ticket_type',
    'ticket_name',
    'ticket_link',
    'distribution_link_slug',
    'number_type',
    'start_time',
    'end_time',
    'total_quantity',
    'download_ratio',
    'account',
    'password',
    'status',
    'sync_total_sum',
    'sync_total_day_sum',
    'sync_total_numbers',
    'sync_online_count',
    'sync_offline_count',
    'sync_numbers',
    'last_synced_at',
  ]

  const updatePayload: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) {
      updatePayload[field] = body[field]
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 })
  }

  // Uniqueness check when ticket_name is being changed
  if ('ticket_name' in updatePayload) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('ticket_name', updatePayload.ticket_name as string)
      .neq('id', id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `工单名称 "${updatePayload.ticket_name}" 已存在，请改用其他名称` },
        { status: 409 }
      )
    }
  }

  const { data, error } = await supabase
    .from('work_orders')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // When status is set to 'completed', disable associated numbers in 号码管理
  if (data.status === 'completed' && data.distribution_link_slug) {
    const adminClient = createAdminClient()
    try {
      const { data: linkData } = await adminClient
        .from('short_links')
        .select('id')
        .eq('slug', data.distribution_link_slug)
        .single()

      if (linkData) {
        const { data: numsToDisable } = await adminClient
          .from('whatsapp_numbers')
          .select('phone_number')
          .eq('short_link_id', linkData.id)
          .eq('label', data.ticket_name)

        if (numsToDisable && numsToDisable.length > 0) {
          const phoneNumbers = numsToDisable.map((n: { phone_number: string }) => n.phone_number)
          const chunkSize = 100
          for (let i = 0; i < phoneNumbers.length; i += chunkSize) {
            const chunk = phoneNumbers.slice(i, i + chunkSize)
            await adminClient
              .from('whatsapp_numbers')
              .update({ is_active: false })
              .eq('short_link_id', linkData.id)
              .eq('label', data.ticket_name)
              .in('phone_number', chunk)
          }
        }
      }
    } catch (err) {
      console.error('[work-order PUT] Failed to disable numbers on completion', err)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params

    // 1. Fetch work order (also verifies ownership via user_id filter)
  const { data: workOrder, error: fetchErr } = await supabase
    .from('work_orders')
    .select('ticket_name, distribution_link_slug, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !workOrder) {
    return NextResponse.json({ error: '工单不存在' }, { status: 404 })
  }

  // 2. Delete associated whatsapp numbers, scoped by short_link_id + label.
  //    Skip when ticket_name is empty/null (would otherwise wipe label='' rows)
  //    or when no distribution link is bound. Use the admin client + chunking
  //    so a large batch can't be partially blocked or time out.
  let deletedNumberCount = 0
  const ticketName = (workOrder.ticket_name ?? '').trim()
  if (ticketName && workOrder.distribution_link_slug) {
    const adminClient = createAdminClient()
    const { data: linkData } = await adminClient
      .from('short_links')
      .select('id, user_id')
      .eq('slug', workOrder.distribution_link_slug)
      .single()

    if (linkData && linkData.user_id === user.id) {
      const { data: numsToDelete } = await adminClient
        .from('whatsapp_numbers')
        .select('phone_number')
        .eq('short_link_id', linkData.id)
        .eq('label', ticketName)

      const phoneNumbers = (numsToDelete ?? []).map(
        (n: { phone_number: string }) => n.phone_number
      )
      const chunkSize = 100
      for (let i = 0; i < phoneNumbers.length; i += chunkSize) {
        const chunk = phoneNumbers.slice(i, i + chunkSize)
        const { count, error: numbersDeleteError } = await adminClient
          .from('whatsapp_numbers')
          .delete({ count: 'exact' })
          .eq('short_link_id', linkData.id)
          .eq('label', ticketName)
          .in('phone_number', chunk)

        if (numbersDeleteError) {
          // Fail loud — don't proceed to delete the work_order, otherwise
          // numbers become orphans and resurface in 号码管理 dropdowns.
          console.error('[work-order delete] number delete failed:', numbersDeleteError)
          return NextResponse.json(
            { error: `删除关联号码失败：${numbersDeleteError.message}` },
            { status: 500 }
          )
        }
        deletedNumberCount += count ?? 0
      }
    }
  }

  // 3. Delete the work order
  const { error } = await supabase
    .from('work_orders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, deleted_numbers: deletedNumberCount })
}
