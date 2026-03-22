import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// POST /api/profile/password — agent changes their own password
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const body = await request.json()
  const { password } = body

  if (!password || password.length < 6) {
    return NextResponse.json({ error: '密码不能少于 6 位' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Update password via admin API
  const { error } = await adminSupabase.auth.admin.updateUserById(user.id, { password })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Also store plain_password in profiles so admin can see it
  await adminSupabase
    .from('profiles')
    .update({ plain_password: password })
    .eq('id', user.id)

  return NextResponse.json({ success: true })
}
