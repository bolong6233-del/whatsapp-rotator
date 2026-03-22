import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

/** Verify caller is an authenticated admin or root. Returns user or null. */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Root admin email always has full access regardless of DB role value
  if (user.email === ROOT_ADMIN_EMAIL) return user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (!profile || !(['admin', 'root', 'root_admin'] as string[]).includes(profile.role)) return null
  return user
}

// GET /api/admin/agents — list all agents with stats
export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const adminSupabase = createAdminClient()

  const isRoot = adminUser.email === ROOT_ADMIN_EMAIL

  // Root admin sees ALL profiles; normal admins see only profiles they created.
  let query = adminSupabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (!isRoot) {
    // Normal admins only see accounts they explicitly created
    query = query.eq('created_by', adminUser.id)
  } else {
    // Root admin sees everyone except themselves
    query = query.neq('email', ROOT_ADMIN_EMAIL)
  }

  const { data: agents, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch stats for each agent in parallel
  const agentsWithStats = await Promise.all(
    (agents || []).map(async (agent) => {
      const { data: links } = await adminSupabase
        .from('short_links')
        .select('id, total_clicks')
        .eq('user_id', agent.id)

      const link_count = links?.length || 0
      const total_clicks = links?.reduce((sum, l) => sum + (l.total_clicks || 0), 0) || 0

      return { ...agent, link_count, total_clicks }
    })
  )

  return NextResponse.json(agentsWithStats)
}

// POST /api/admin/agents — create a new agent account
export async function POST(request: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, role: newRole } = body

  if (!email || !password) {
    return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 })
  }

  // Only Root Admin can assign the 'admin' role
  const isRoot = adminUser.email === ROOT_ADMIN_EMAIL
  const allowedRoles = isRoot ? ['guest', 'agent', 'admin'] : ['guest', 'agent']
  const assignedRole = allowedRoles.includes(newRole) ? newRole : 'agent'

  const adminSupabase = createAdminClient()

  // Create the user via admin API (does not affect current session)
  const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Upsert profile row with the chosen role
  const { error: upsertError } = await adminSupabase
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      email,
      role: assignedRole,
      status: 'active',
      plain_password: password,
      created_by: adminUser.id,
    }, { onConflict: 'id' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, user: newUser.user }, { status: 201 })
}
