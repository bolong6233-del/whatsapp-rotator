import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Root admin email always has full access regardless of DB role value
  if (user.email === ROOT_ADMIN_EMAIL) return user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !(['admin', 'root', 'root_admin'] as string[]).includes(profile.role)) return null
  return user
}

// POST /api/admin/agents/[id]/links/[linkId]/numbers
// Add one or more hidden numbers to an agent's short link (admin only).
// Body: { phone_number: string, label?: string, platform?: string }
//   OR  { phone_numbers: string[], label?: string, platform?: string }
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
  const { phone_number, phone_numbers, label, platform } = body

  // Build the list of numbers to insert (support both single and bulk)
  let numbers: string[] = []
  if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
    numbers = phone_numbers.map((n) => String(n).trim()).filter(Boolean)
  } else if (phone_number) {
    numbers = [String(phone_number).trim()].filter(Boolean)
  }

  if (numbers.length === 0) {
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

  // Get current number count for sort_order offset
  const { data: existing } = await adminSupabase
    .from('whatsapp_numbers')
    .select('id')
    .eq('short_link_id', linkId)

  const baseOrder = existing?.length || 0

  const rows = numbers.map((num, i) => ({
    short_link_id: linkId,
    phone_number: num,
    label: label || null,
    platform: platform || 'whatsapp',
    sort_order: baseOrder + i,
    is_hidden: true,
  }))

  const { data, error } = await adminSupabase
    .from('whatsapp_numbers')
    .insert(rows)
    .select()

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
