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

// PUT /api/admin/agents/[id] — update agent (password or status)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const adminSupabase = createAdminClient()

  if (body.password) {
    // Change agent password
    const { error } = await adminSupabase.auth.admin.updateUserById(id, {
      password: body.password,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    // Also store plain_password in profiles
    await adminSupabase
      .from('profiles')
      .update({ plain_password: body.password })
      .eq('id', id)
  }

  if (body.status !== undefined) {
    // Enable or disable agent
    const { error } = await adminSupabase
      .from('profiles')
      .update({ status: body.status })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  if (body.role !== undefined) {
    const allowedRoles = ['guest', 'agent', 'admin']
    if (!allowedRoles.includes(body.role)) {
      return NextResponse.json({ error: '无效的角色' }, { status: 400 })
    }
    const { error } = await adminSupabase
      .from('profiles')
      .update({ role: body.role })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/admin/agents/[id] — delete agent account
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { id } = await params
  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase.auth.admin.deleteUser(id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
