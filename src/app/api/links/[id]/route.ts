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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role
  const isAdmin = role === 'admin' || role === 'root' || role === 'root_admin'

  const { id } = await params
  const { data, error } = await supabase
    .from('short_links')
    .select('*, whatsapp_numbers(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '未找到' }, { status: 404 })
  }

  if (!isAdmin && data.whatsapp_numbers) {
    data.whatsapp_numbers = data.whatsapp_numbers.filter(
      (n: { is_hidden: boolean }) => !n.is_hidden
    )
  }

  return NextResponse.json(data)
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
  const {
    title,
    description,
    is_active,
    tiktok_pixel_enabled,
    tiktok_pixel_id,
    tiktok_event_type,
    fb_pixel_enabled,
    fb_pixel_id,
    fb_event_type,
  } = body

  const pixelEnabled = tiktok_pixel_enabled !== undefined ? Boolean(tiktok_pixel_enabled) : undefined
  const fbEnabled = fb_pixel_enabled !== undefined ? Boolean(fb_pixel_enabled) : undefined

  const updatePayload: Record<string, unknown> = {}
  if (title !== undefined) updatePayload.title = title
  if (description !== undefined) updatePayload.description = description
  if (is_active !== undefined) updatePayload.is_active = is_active
  if (pixelEnabled !== undefined) {
    updatePayload.tiktok_pixel_enabled = pixelEnabled
    updatePayload.tiktok_pixel_id = pixelEnabled ? (tiktok_pixel_id ?? null) : null
    updatePayload.tiktok_access_token = null
    updatePayload.tiktok_event_type = pixelEnabled ? (tiktok_event_type ?? 'SubmitForm') : null
  }
  if (fbEnabled !== undefined) {
    updatePayload.fb_pixel_enabled = fbEnabled
    updatePayload.fb_pixel_id = fbEnabled ? (fb_pixel_id ?? null) : null
    updatePayload.fb_event_type = fbEnabled ? (fb_event_type ?? 'Lead') : null
  }

  const { id } = await params
  const { data, error } = await supabase
    .from('short_links')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  const { error } = await supabase
    .from('short_links')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
