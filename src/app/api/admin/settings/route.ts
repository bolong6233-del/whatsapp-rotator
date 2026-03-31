import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

const DEFAULT_SETTINGS = {
  announcement_text: '如需提升短链配额或遇到问题，请联系您的专属管理员。',
  admin_contact_url: 'https://t.me/TKJZYL',
  admin_contact_label: '联系管理员 @TKJZYL',
}

/** Verify caller is an authenticated admin or root. Returns user or null. */
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

// GET /api/admin/settings — fetch site settings (public, no auth required)
export async function GET() {
  const adminSupabase = createAdminClient()
  const { data, error } = await adminSupabase
    .from('site_settings')
    .select('announcement_text, admin_contact_url, admin_contact_label')
    .eq('id', 1)
    .single()

  if (error || !data) {
    return NextResponse.json(DEFAULT_SETTINGS)
  }

  return NextResponse.json({
    announcement_text: data.announcement_text || DEFAULT_SETTINGS.announcement_text,
    admin_contact_url: data.admin_contact_url || DEFAULT_SETTINGS.admin_contact_url,
    admin_contact_label: data.admin_contact_label || DEFAULT_SETTINGS.admin_contact_label,
  })
}

// PUT /api/admin/settings — update site settings (admin only)
export async function PUT(request: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json()
  const { announcement_text, admin_contact_url, admin_contact_label } = body

  // Validate inputs
  if (announcement_text !== undefined && (typeof announcement_text !== 'string' || announcement_text.length > 2000)) {
    return NextResponse.json({ error: '公告内容不能超过 2000 字符' }, { status: 400 })
  }
  if (admin_contact_label !== undefined && (typeof admin_contact_label !== 'string' || admin_contact_label.length > 100)) {
    return NextResponse.json({ error: '按钮文字不能超过 100 字符' }, { status: 400 })
  }
  if (admin_contact_url !== undefined) {
    if (typeof admin_contact_url !== 'string' || admin_contact_url.length > 500) {
      return NextResponse.json({ error: '联系链接不能超过 500 字符' }, { status: 400 })
    }
    try {
      const parsed = new URL(admin_contact_url)
      if (!['http:', 'https:', 'tg:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: '联系链接格式无效，仅支持 http/https/tg 协议' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: '联系链接格式无效' }, { status: 400 })
    }
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('site_settings')
    .upsert({
      id: 1,
      announcement_text: announcement_text ?? DEFAULT_SETTINGS.announcement_text,
      admin_contact_url: admin_contact_url ?? DEFAULT_SETTINGS.admin_contact_url,
      admin_contact_label: admin_contact_label ?? DEFAULT_SETTINGS.admin_contact_label,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
