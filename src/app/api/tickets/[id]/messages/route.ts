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

  // Verify ticket belongs to user
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!ticket) {
    return NextResponse.json({ error: '未找到' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

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

  const { id } = await params

  // Verify ticket belongs to user
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!ticket) {
    return NextResponse.json({ error: '未找到' }, { status: 404 })
  }

  const body = await request.json()
  const { message } = body

  if (!message) {
    return NextResponse.json({ error: '消息不能为空' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ticket_messages')
    .insert({
      ticket_id: id,
      user_id: user.id,
      message,
      is_admin: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}
