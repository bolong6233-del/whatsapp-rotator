import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const body = await request.json()
  const {
    ticket_type,
    ticket_name,
    ticket_link,
    distribution_link_slug,
    number_type,
    start_time,
    end_time,
    total_quantity,
    download_ratio,
    account,
    password,
  } = body

  if (!ticket_type || !ticket_name || !ticket_link || !distribution_link_slug || !start_time || !end_time) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
  }

  // Uniqueness check: reject duplicate ticket_name within the same user
  const { data: existing } = await supabase
    .from('work_orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('ticket_name', ticket_name)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `工单名称 "${ticket_name}" 已存在，请改用其他名称` },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      user_id: user.id,
      ticket_type,
      ticket_name,
      ticket_link,
      distribution_link_slug,
      number_type: number_type || 'whatsapp',
      start_time,
      end_time,
      total_quantity: total_quantity || 0,
      download_ratio: download_ratio || 0,
      account: account || null,
      password: password || null,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}
