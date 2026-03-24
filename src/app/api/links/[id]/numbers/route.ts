import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import {
  checkIdempotency,
  markIdempotencySucceeded,
  markIdempotencyFailed,
  handleUniqueViolation,
} from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

/** Shared helper: checks the short_link exists and belongs to the current user (admin bypass). */
async function verifyLinkOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true
  const { data: link } = await supabase
    .from('short_links')
    .select('user_id')
    .eq('id', id)
    .single()
  return !!link && link.user_id === userId
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role
  const isAdmin = role === 'admin' || role === 'root' || role === 'root_admin'

  const { id } = await params

  if (!(await verifyLinkOwnership(supabase, id, user.id, isAdmin))) {
    return NextResponse.json({ error: '未授权' }, { status: 403 })
  }

  let query = supabase
    .from('whatsapp_numbers')
    .select('*')
    .eq('short_link_id', id)
    .order('sort_order', { ascending: true })

  if (!isAdmin) {
    query = query.eq('is_hidden', false)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role
  const isAdmin = role === 'admin' || role === 'root' || role === 'root_admin'

  const { id } = await params

  if (!(await verifyLinkOwnership(supabase, id, user.id, isAdmin))) {
    return NextResponse.json({ error: '未授权' }, { status: 403 })
  }

  const body = await request.json()
  const { phone_number, label } = body

  // ── Layer 2: idempotency check ────────────────────────────────────────────
  const idem = await checkIdempotency(
    request,
    user.id,
    `POST /api/links/${id}/numbers`,
    body,
  )
  if (idem.reply) return idem.reply

  const { data: existing } = await supabase
    .from('whatsapp_numbers')
    .select('id')
    .eq('short_link_id', id)

  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .insert({
      short_link_id: id,
      phone_number,
      label: label || null,
      sort_order: existing?.length || 0,
    })
    .select()
    .single()

  if (error) {
    if (idem.recordId) await markIdempotencyFailed(idem.recordId)
    // ── Layer 3: convert DB unique-constraint violation to friendly 409 ────
    const uniqueReply = handleUniqueViolation(error, {
      whatsapp_numbers_short_link_phone_unique: '该号码已存在，请勿重复添加',
      default: '该号码已存在，请勿重复添加',
    })
    if (uniqueReply) return uniqueReply
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (idem.recordId) {
    await markIdempotencySucceeded(idem.recordId, 201, data, 'whatsapp_number', data.id)
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role
  const isAdmin = role === 'admin' || role === 'root' || role === 'root_admin'

  const { searchParams } = new URL(request.url)
  const numberId = searchParams.get('numberId')

  if (!numberId) {
    return NextResponse.json({ error: '缺少 numberId 参数' }, { status: 400 })
  }

  const { id } = await params

  if (!(await verifyLinkOwnership(supabase, id, user.id, isAdmin))) {
    return NextResponse.json({ error: '未授权' }, { status: 403 })
  }

  const { error } = await supabase
    .from('whatsapp_numbers')
    .delete()
    .eq('id', numberId)
    .eq('short_link_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role
  const isAdmin = role === 'admin' || role === 'root' || role === 'root_admin'

  const { id } = await params

  if (!(await verifyLinkOwnership(supabase, id, user.id, isAdmin))) {
    return NextResponse.json({ error: '未授权' }, { status: 403 })
  }

  const body = await request.json()
  const { numbers } = body

  const updates = numbers.map((n: { id: string; sort_order: number }) =>
    supabase
      .from('whatsapp_numbers')
      .update({ sort_order: n.sort_order })
      .eq('id', n.id)
      .eq('short_link_id', id)
  )

  await Promise.all(updates)

  return NextResponse.json({ success: true })
}

