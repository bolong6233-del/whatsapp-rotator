import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
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
  const isAdmin = profile?.role === 'admin'

  const { data, error } = await supabase
    .from('short_links')
    .select('*, whatsapp_numbers(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!isAdmin && data) {
    for (const link of data) {
      if (link.whatsapp_numbers) {
        link.whatsapp_numbers = link.whatsapp_numbers.filter(
          (n: { is_hidden: boolean }) => !n.is_hidden
        )
      }
    }
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  // Enforce role/expiry restrictions
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, expires_at')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'guest'

  if (role === 'guest') {
    return NextResponse.json({ error: '游客账号无法创建短链，请联系管理员开通权限' }, { status: 403 })
  }

  if (role === 'agent') {
    const expiresAt = profile?.expires_at ? new Date(profile.expires_at) : null
    if (!expiresAt || expiresAt < new Date()) {
      return NextResponse.json({ error: '您的账号已到期或未分配使用时间，请联系管理员续费' }, { status: 403 })
    }
  }

  const body = await request.json()
  const {
    slug,
    title,
    description,
    numbers,
    tiktok_pixel_enabled,
    tiktok_pixel_id,
    tiktok_event_type,
    fb_pixel_enabled,
    fb_pixel_id,
    fb_event_type,
  } = body

  if (!slug) {
    return NextResponse.json({ error: '短链后缀不能为空' }, { status: 400 })
  }

  const pixelEnabled = Boolean(tiktok_pixel_enabled)
  const fbEnabled = Boolean(fb_pixel_enabled)

  const { data: link, error: linkError } = await supabase
    .from('short_links')
    .insert({
      slug,
      title,
      description,
      user_id: user.id,
      tiktok_pixel_enabled: pixelEnabled,
      tiktok_pixel_id: pixelEnabled ? (tiktok_pixel_id ?? null) : null,
      tiktok_access_token: null,
      tiktok_event_type: pixelEnabled ? (tiktok_event_type ?? 'SubmitForm') : null,
      fb_pixel_enabled: fbEnabled,
      fb_pixel_id: fbEnabled ? (fb_pixel_id ?? null) : null,
      fb_event_type: fbEnabled ? (fb_event_type ?? 'Lead') : null,
    })
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
