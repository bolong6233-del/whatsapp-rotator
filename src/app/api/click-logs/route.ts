import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// DELETE /api/click-logs — delete click log records by ID
// Body: { ids: string[] }
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const body = await request.json()
  const ids: string[] = body?.ids

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: '请提供要删除的记录 ID 列表' }, { status: 400 })
  }

  // Security check: verify the click_logs belong to short_links owned by this user
  // (or the user is an admin — admins can delete any log)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin =
    profile &&
    (['admin', 'root', 'root_admin'] as string[]).includes(profile.role as string)

  const adminClient = createAdminClient()

  if (!isAdmin) {
    // Verify all requested IDs are associated with the current user's short_links
    const { data: logsToCheck, error: checkError } = await adminClient
      .from('click_logs')
      .select('id, short_links!inner(user_id)')
      .in('id', ids)

    if (checkError) {
      return NextResponse.json({ error: checkError.message }, { status: 400 })
    }

    const unauthorizedLogs = (logsToCheck ?? []).filter((log) => {
      const sl = log.short_links as unknown as { user_id: string } | null
      return sl?.user_id !== user.id
    })

    if (unauthorizedLogs.length > 0) {
      return NextResponse.json({ error: '无权删除部分记录' }, { status: 403 })
    }
  }

  // Perform the delete using the admin client to bypass RLS
  const { error } = await adminClient.from('click_logs').delete().in('id', ids)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
