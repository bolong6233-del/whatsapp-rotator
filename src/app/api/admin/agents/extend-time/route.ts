import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  if (user.email === ROOT_ADMIN_EMAIL) return user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !(['admin', 'root', 'root_admin'] as string[]).includes(profile.role)) return null
  return user
}

function addInterval(date: Date, period: string): Date {
  const result = new Date(date)
  switch (period) {
    case '1d': result.setDate(result.getDate() + 1); break
    case '1m': result.setMonth(result.getMonth() + 1); break
    case '3m': result.setMonth(result.getMonth() + 3); break
    case '6m': result.setMonth(result.getMonth() + 6); break
    case '1y': result.setFullYear(result.getFullYear() + 1); break
    default: throw new Error(`Invalid period: ${period}`)
  }
  return result
}

const VALID_PERIODS = ['1d', '1m', '3m', '6m', '1y']

// POST /api/admin/agents/extend-time — extend expires_at for a user
export async function POST(request: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, period } = body

  if (!userId || !period) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  }

  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: '无效的时间段' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Get current expires_at
  const { data: profile, error: fetchError } = await adminSupabase
    .from('profiles')
    .select('expires_at')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 })
  }

  // If expires_at is null or in the past, start from NOW()
  // Otherwise, extend from the current expires_at
  const now = new Date()
  const currentExpiry = profile.expires_at ? new Date(profile.expires_at) : null
  const baseDate = (!currentExpiry || currentExpiry < now) ? now : currentExpiry

  const newExpiry = addInterval(baseDate, period)

  const { error: updateError } = await adminSupabase
    .from('profiles')
    .update({ expires_at: newExpiry.toISOString() })
    .eq('id', userId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, expires_at: newExpiry.toISOString() })
}
