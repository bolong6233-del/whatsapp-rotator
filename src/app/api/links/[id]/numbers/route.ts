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
    .from('whatsapp_numbers')
    .select('*')
    .eq('short_link_id', id)
    .order('sort_order', { ascending: true })

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

  const body = await request.json()
  const { phone_number, label } = body

  const { id } = await params
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
    return NextResponse.json({ error: error.message }, { status: 400 })
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

  const { searchParams } = new URL(request.url)
  const numberId = searchParams.get('numberId')

  if (!numberId) {
    return NextResponse.json({ error: '缺少 numberId 参数' }, { status: 400 })
  }

  const { id } = await params
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

  const body = await request.json()
  const { numbers } = body

  const { id } = await params
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
