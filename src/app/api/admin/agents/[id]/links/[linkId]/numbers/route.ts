import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') return null
  return user
}

// POST /api/admin/agents/[id]/links/[linkId]/numbers
// Add a hidden number to an agent's short link (only admin can do this)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { linkId } = await params
  const body = await request.json()
  const { phone_number, label, platform } = body

  if (!phone_number) {
    return NextResponse.json({ error: '号码不能为空' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Verify the link exists
  const { data: link, error: linkError } = await adminSupabase
    .from('short_links')
    .select('id')
    .eq('id', linkId)
    .single()

  if (linkError || !link) {
    return NextResponse.json({ error: '短链不存在' }, { status: 404 })
  }

  // Get current number count for sort_order
  const { data: existing } = await adminSupabase
    .from('whatsapp_numbers')
    .select('id')
    .eq('short_link_id', linkId)

  const { data, error } = await adminSupabase
    .from('whatsapp_numbers')
    .insert({
      short_link_id: linkId,
      phone_number,
      label: label || null,
      platform: platform || 'whatsapp',
      sort_order: existing?.length || 0,
      is_hidden: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/admin/agents/[id]/links/[linkId]/numbers?numberId=xxx
// Remove a number from an agent's link (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { linkId } = await params
  const { searchParams } = new URL(request.url)
  const numberId = searchParams.get('numberId')

  if (!numberId) {
    return NextResponse.json({ error: '缺少 numberId 参数' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase
    .from('whatsapp_numbers')
    .delete()
    .eq('id', numberId)
    .eq('short_link_id', linkId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
