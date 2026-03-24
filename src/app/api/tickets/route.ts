import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import {
  checkIdempotency,
  markIdempotencySucceeded,
  markIdempotencyFailed,
} from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('tickets')
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
  const { title, description, priority } = body

  if (!title) {
    return NextResponse.json({ error: '标题不能为空' }, { status: 400 })
  }

  // ── Layer 2: idempotency check ────────────────────────────────────────────
  const idem = await checkIdempotency(request, user.id, 'POST /api/tickets', body)
  if (idem.reply) return idem.reply

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      title,
      description: description || null,
      priority: priority || 'medium',
      user_id: user.id,
    })
    .select()
    .single()

  if (error) {
    if (idem.recordId) await markIdempotencyFailed(idem.recordId)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (idem.recordId) {
    await markIdempotencySucceeded(idem.recordId, 201, data, 'ticket', data.id)
  }
  return NextResponse.json(data, { status: 201 })
}
