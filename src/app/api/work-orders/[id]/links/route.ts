import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkIdempotency,
  markIdempotencySucceeded,
  markIdempotencyFailed,
} from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

/** Shared helper: verifies the work order exists and belongs to the current user. */
async function verifyWorkOrderOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workOrderId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true
  const { data } = await supabase
    .from('work_orders')
    .select('user_id')
    .eq('id', workOrderId)
    .single()
  return !!data && data.user_id === userId
}

/**
 * GET /api/work-orders/[id]/links
 * Returns all short links bound to this work order.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  if (!(await verifyWorkOrderOwnership(supabase, id, user.id, isAdmin))) {
    return NextResponse.json({ error: '未授权' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('work_order_short_links')
    .select('id, short_link_id, created_at, short_links(id, slug, title)')
    .eq('work_order_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

/**
 * POST /api/work-orders/[id]/links
 * Binds a short link to this work order (creates a work_order_short_links record).
 * Body: { short_link_id: string }
 * Supports Idempotency-Key header; duplicate bindings return the existing record.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  if (!(await verifyWorkOrderOwnership(supabase, id, user.id, isAdmin))) {
    return NextResponse.json({ error: '未授权' }, { status: 403 })
  }

  const body = await request.json()
  const { short_link_id } = body

  if (!short_link_id) {
    return NextResponse.json({ error: '缺少 short_link_id 字段' }, { status: 400 })
  }

  // ── Layer 2: idempotency check ────────────────────────────────────────────
  const idem = await checkIdempotency(
    request,
    user.id,
    `POST /api/work-orders/${id}/links`,
    body,
  )
  if (idem.reply) return idem.reply

  // Use admin client so the INSERT bypasses RLS on work_order_short_links
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('work_order_short_links')
    .insert({ work_order_id: id, short_link_id })
    .select()
    .single()

  if (error) {
    if (idem.recordId) await markIdempotencyFailed(idem.recordId)

    // ── Layer 3: duplicate binding ─────────────────────────────────────────
    // If the same (work_order_id, short_link_id) pair already exists, return
    // the existing record as an idempotent success rather than a hard error.
    if (error.code === '23505') {
      const { data: existing } = await adminClient
        .from('work_order_short_links')
        .select()
        .eq('work_order_id', id)
        .eq('short_link_id', short_link_id)
        .single()
      if (existing) {
        // Mark idempotency succeeded with the existing record
        if (idem.recordId) {
          await markIdempotencySucceeded(idem.recordId, 200, existing, 'work_order_short_link', existing.id)
        }
        return NextResponse.json(existing, { status: 200 })
      }
      return NextResponse.json({ error: '该短链已绑定此工单，请勿重复操作' }, { status: 409 })
    }

    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (idem.recordId) {
    await markIdempotencySucceeded(idem.recordId, 201, data, 'work_order_short_link', data.id)
  }
  return NextResponse.json(data, { status: 201 })
}

/**
 * DELETE /api/work-orders/[id]/links?short_link_id=<uuid>
 * Removes the binding between a work order and a short link.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  if (!(await verifyWorkOrderOwnership(supabase, id, user.id, isAdmin))) {
    return NextResponse.json({ error: '未授权' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const shortLinkId = searchParams.get('short_link_id')

  if (!shortLinkId) {
    return NextResponse.json({ error: '缺少 short_link_id 参数' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('work_order_short_links')
    .delete()
    .eq('work_order_id', id)
    .eq('short_link_id', shortLinkId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
