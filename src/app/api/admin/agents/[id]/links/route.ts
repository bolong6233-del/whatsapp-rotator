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

// GET /api/admin/agents/[id]/links — fetch all short links for a specific agent
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { id } = await params
  const adminSupabase = createAdminClient()
  const isRoot = adminUser.email === ROOT_ADMIN_EMAIL

  // Non-root admins can only access agents they created
  if (!isRoot) {
    const { data: agentProfile } = await adminSupabase
      .from('profiles')
      .select('created_by')
      .eq('id', id)
      .single()

    if (!agentProfile || agentProfile.created_by !== adminUser.id) {
      return NextResponse.json({ error: '无权限访问该代理的数据' }, { status: 403 })
    }
  }

  const { data: links, error } = await adminSupabase
    .from('short_links')
    .select(`
      id,
      slug,
      title,
      total_clicks,
      is_active,
      created_at,
      whatsapp_numbers (
        id,
        phone_number,
        label,
        platform,
        is_active,
        is_hidden,
        click_count,
        sort_order
      )
    `)
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .order('sort_order', { referencedTable: 'whatsapp_numbers', ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(links || [])
}
