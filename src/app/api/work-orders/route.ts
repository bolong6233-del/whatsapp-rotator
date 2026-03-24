import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import {
  checkIdempotency,
  markIdempotencySucceeded,
  markIdempotencyFailed,
  handleUniqueViolation,
} from '@/lib/idempotency'

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

  // ── Layer 2: idempotency check ────────────────────────────────────────────
  const idem = await checkIdempotency(request, user.id, 'POST /api/work-orders', body)
  if (idem.reply) return idem.reply

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
    if (idem.recordId) await markIdempotencyFailed(idem.recordId)
    // ── Layer 3: convert DB unique-constraint violation to friendly 409 ────
    const uniqueReply = handleUniqueViolation(error, {
      work_orders_business_dedup_idx: '检测到重复提交，该工单已存在，请勿连续点击',
      default: '检测到重复提交，请勿连续点击',
    })
    if (uniqueReply) return uniqueReply
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (idem.recordId) {
    await markIdempotencySucceeded(idem.recordId, 201, data, 'work_order', data.id)
  }
  return NextResponse.json(data, { status: 201 })
}
