import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

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
  const { error } = await supabase
    .from('work_orders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
