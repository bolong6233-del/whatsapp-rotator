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
    .from('short_links')
    .select('*, whatsapp_numbers(*)')
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
  const { slug, title, description, numbers } = body

  if (!slug) {
    return NextResponse.json({ error: '短链后缀不能为空' }, { status: 400 })
  }

  const { data: link, error: linkError } = await supabase
    .from('short_links')
    .insert({ slug, title, description, user_id: user.id })
    .select()
    .single()

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 })
  }

  if (numbers && numbers.length > 0) {
    const numberInserts = numbers.map((n: { phone_number: string; label?: string }, i: number) => ({
      short_link_id: link.id,
      phone_number: n.phone_number,
      label: n.label || null,
      sort_order: i,
    }))

    await supabase.from('whatsapp_numbers').insert(numberInserts)
  }

  return NextResponse.json(link, { status: 201 })
}
