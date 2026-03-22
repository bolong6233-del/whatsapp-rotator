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

  // Upsert profile row — insert if missing (trigger may not have run),
  // or update if the trigger already inserted it with a different role.
  // Using onConflict: 'id' ensures DO UPDATE (not DO NOTHING) on conflict.
  const { error: upsertError } = await adminSupabase
    .from('profiles')
    .upsert(
      {
        id: newUser.user.id,
        email,
        role: 'guest',
        status: 'active',
        plain_password: password,
      },
      { onConflict: 'id' }
    )

  if (upsertError) {
    // Belt-and-suspenders: if upsert failed (e.g. row exists from trigger),
    // force an explicit UPDATE to guarantee role is 'guest'.
    const { error: updateError } = await adminSupabase
      .from('profiles')
      .update({ role: 'guest', plain_password: password, status: 'active' })
      .eq('id', newUser.user.id)

    if (updateError) {
      // Auth user was created but profile couldn't be set to 'guest'.
      // Return error so the client is aware; admin can fix via the agents page.
      return NextResponse.json(
        { error: '账号已创建，但角色设置失败，请联系管理员' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
