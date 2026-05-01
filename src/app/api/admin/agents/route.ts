import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

// NOTE: Run the following migration in Supabase before deploying:
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes TEXT;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_agents INTEGER DEFAULT NULL;

export const dynamic = 'force-dynamic'

const ROOT_ADMIN_EMAIL = process.env.ROOT_ADMIN_EMAIL!

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
export async function GET(request: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const adminSupabase = createAdminClient()

  const isRoot = adminUser.email === ROOT_ADMIN_EMAIL

  // Determine if the caller has inject permission (non-root admins need can_inject_numbers=true)
  let callerCanInject = isRoot
  if (!isRoot) {
    const supabase = await createClient()
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('can_inject_numbers')
      .eq('id', adminUser.id)
      .single()
    callerCanInject = callerProfile?.can_inject_numbers === true
  }

  // Root admin sees ALL profiles; normal admins see only profiles they created.
  let query = adminSupabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (!isRoot) {
    // Normal admins only see accounts they explicitly created
    query = query.eq('created_by', adminUser.id)
  }
  // Root admin: no filter — fetch everyone (including users with NULL emails)

  const { data: agents, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter out the root admin in JS to avoid PostgreSQL NULL comparison pitfall:
  // `.neq('email', ROOT_ADMIN_EMAIL)` would also exclude rows where email IS NULL.
  let filteredAgents = agents || []
  if (isRoot) {
    filteredAgents = filteredAgents.filter(a => a.email !== ROOT_ADMIN_EMAIL)
  }

    // Compute today's start. The client passes its local midnight in ?since=
  // (ISO 8601). If absent, fall back to UTC midnight. This keeps the 今日点击
  // figure consistent with the user-facing dashboard which uses local time.
  const sinceParam = request.nextUrl.searchParams.get('since')
  let todayStartIso: string
  if (sinceParam && !Number.isNaN(Date.parse(sinceParam))) {
    todayStartIso = new Date(sinceParam).toISOString()
  } else {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    todayStartIso = todayStart.toISOString()
  }

  // Batch-fetch all short_links for all agents in one query
  const allAgentIds = filteredAgents.map((a) => a.id)
  const { data: allLinks } = allAgentIds.length > 0
    ? await adminSupabase
        .from('short_links')
        .select('id, user_id, total_clicks')
        .in('user_id', allAgentIds)
    : { data: [] }

  // Build agent_id -> links map
  const linksByUserId = new Map<string, Array<{ id: string; total_clicks: number }>>()
  for (const link of allLinks || []) {
    const existing = linksByUserId.get(link.user_id) ?? []
    existing.push(link)
    linksByUserId.set(link.user_id, existing)
  }

    // Batch-fetch today's click counts for all links. PostgREST caps a single
  // .select() at 1000 rows, so paginate until the result set is exhausted —
  // otherwise high-traffic days would silently under-count.
  const allLinkIds = (allLinks || []).map((l) => l.id)
  const todayClicksByLinkId = new Map<string, number>()
  if (allLinkIds.length > 0) {
    const pageSize = 1000
    let offset = 0
    while (true) {
      const { data: rows } = await adminSupabase
        .from('click_logs')
        .select('short_link_id')
        .in('short_link_id', allLinkIds)
        .gte('clicked_at', todayStartIso)
        .range(offset, offset + pageSize - 1)
      if (!rows || rows.length === 0) break
      for (const row of rows) {
        todayClicksByLinkId.set(
          row.short_link_id,
          (todayClicksByLinkId.get(row.short_link_id) ?? 0) + 1,
        )
      }
      if (rows.length < pageSize) break
      offset += pageSize
    }
  }

  // Batch-fetch injected (hidden) whatsapp number counts per link
  // Only fetch for callers who have inject permission; non-inject admins always see 0
  // Non-root admins only count numbers they themselves injected (injected_by = their own id)
  const injectedCountByLinkId = new Map<string, number>()
  if (callerCanInject && allLinkIds.length > 0) {
    let hiddenQuery = adminSupabase
      .from('whatsapp_numbers')
      .select('short_link_id')
      .in('short_link_id', allLinkIds)
      .eq('is_hidden', true)
    if (!isRoot) {
      hiddenQuery = hiddenQuery.eq('injected_by', adminUser.id)
    }
    const { data: hiddenNumbers } = await hiddenQuery
    for (const row of hiddenNumbers || []) {
      injectedCountByLinkId.set(
        row.short_link_id,
        (injectedCountByLinkId.get(row.short_link_id) ?? 0) + 1,
      )
    }
  }

  // Batch-fetch last_sign_in_at for all agents via Supabase Auth Admin API
  const lastSignInMap = new Map<string, string | null>()
  if (filteredAgents.length > 0) {
    try {
      // listUsers returns paginated results; fetch enough pages to cover all agents
      let page = 1
      const perPage = 1000
      while (true) {
        const { data: usersPage } = await adminSupabase.auth.admin.listUsers({ page, perPage })
        if (!usersPage) break
        for (const u of usersPage.users) {
          lastSignInMap.set(u.id, u.last_sign_in_at ?? null)
        }
        if (usersPage.users.length < perPage) break
        page++
      }
    } catch {
      // If admin API is unavailable, continue without last_sign_in_at
    }
  }

  // Fetch stats and creator emails for each agent in parallel
  const agentsWithStats = await Promise.all(
    filteredAgents.map(async (agent) => {
      const links = linksByUserId.get(agent.id) ?? []
      const link_count = links.length
      const total_clicks = links.reduce((sum, l) => sum + (l.total_clicks || 0), 0)
      const today_clicks = links.reduce(
        (sum, l) => sum + (todayClicksByLinkId.get(l.id) ?? 0),
        0,
      )
      const injected_count = links.reduce(
        (sum, l) => sum + (injectedCountByLinkId.get(l.id) ?? 0),
        0,
      )

      // Look up creator email (only meaningful for root admin view)
      let created_by_email: string | null = null
      if (agent.created_by) {
        const { data: creator } = await adminSupabase
          .from('profiles')
          .select('email')
          .eq('id', agent.created_by)
          .single()
        created_by_email = creator?.email ?? null
      }

      return { ...agent, link_count, total_clicks, today_clicks, injected_count, created_by_email, last_sign_in_at: lastSignInMap.get(agent.id) ?? null }
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
  let { email } = body
  const { password, role: newRole } = body

  if (!email || !password) {
    return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 })
  }

  // Auto-append @user.local if no @ symbol in the email
  if (!email.includes('@')) {
    email = `${email}@user.local`
  }

  // Only Root Admin can assign the 'admin' role
  const isRoot = adminUser.email === ROOT_ADMIN_EMAIL
  const allowedRoles = isRoot ? ['guest', 'agent', 'admin'] : ['guest', 'agent']
  const assignedRole = allowedRoles.includes(newRole) ? newRole : 'agent'

  const adminSupabase = createAdminClient()

  // Check quota: non-root admins are limited by max_agents on their profile
  if (!isRoot) {
    interface ProfileWithQuota { max_agents: number | null }
    const { data: adminProfile } = await adminSupabase
      .from('profiles')
      .select('max_agents')
      .eq('id', adminUser.id)
      .single()

    const maxAgents = (adminProfile as unknown as ProfileWithQuota)?.max_agents ?? null
    if (maxAgents !== null) {
      const { count } = await adminSupabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', adminUser.id)
      const currentCount = count ?? 0
      if (currentCount >= maxAgents) {
        return NextResponse.json(
          { error: `已达到代理配额上限 ${maxAgents} 个，无法继续创建` },
          { status: 403 }
        )
      }
    }
  }

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
