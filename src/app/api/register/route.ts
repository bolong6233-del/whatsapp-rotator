import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// POST /api/register — self-registration with username (no email suffix needed)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { username, password } = body

  if (!username || !password) {
    return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: '密码长度不能少于 6 位' }, { status: 400 })
  }

  // Validate username: alphanumeric and underscores only
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json({ error: '用户名只能包含字母、数字和下划线' }, { status: 400 })
  }

  const email = `${username}@user.local`

  const adminSupabase = createAdminClient()

  // Create the user via admin API (skips email confirmation)
  const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    if (createError.message.includes('already registered') || createError.message.includes('already exists')) {
      return NextResponse.json({ error: '该用户名已被注册，请换一个' }, { status: 409 })
    }
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 400 })
  }

  // Upsert profile row with role 'guest' and plain_password
  await adminSupabase
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      email,
      role: 'guest',
      status: 'active',
      plain_password: password,
    })

  return NextResponse.json({ success: true }, { status: 201 })
}
