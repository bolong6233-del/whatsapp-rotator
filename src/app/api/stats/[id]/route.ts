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
  const { data: link } = await supabase
    .from('short_links')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!link) {
    return NextResponse.json({ error: '未找到' }, { status: 404 })
  }

  const { data: numbers } = await supabase
    .from('whatsapp_numbers')
    .select('*')
    .eq('short_link_id', id)
    .order('click_count', { ascending: false })

  const { data: logs } = await supabase
    .from('click_logs')
    .select('*, whatsapp_numbers(phone_number, label)')
    .eq('short_link_id', id)
    .order('clicked_at', { ascending: false })
    .limit(100)

  return NextResponse.json({
    link,
    numbers: numbers || [],
    logs: logs || [],
    total_clicks: link.total_clicks,
  })
}
