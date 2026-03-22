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

// PATCH /api/admin/agents/[id]/links/[linkId]
// Update admin-controlled settings on a short link (e.g. admin_random_siphon_enabled)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { linkId } = await params
  const body = await request.json()
  const { admin_random_siphon_enabled } = body

  if (typeof admin_random_siphon_enabled !== 'boolean') {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  const { data, error } = await adminSupabase
    .from('short_links')
    .update({ admin_random_siphon_enabled, updated_at: new Date().toISOString() })
    .eq('id', linkId)
    .select('id, admin_random_siphon_enabled')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
