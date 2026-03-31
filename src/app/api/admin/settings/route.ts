import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const ROOT_ADMIN_EMAIL = process.env.ROOT_ADMIN_EMAIL!

const DEFAULT_SETTINGS = {
  announcement_text: '如需提升短链配额或遇到问题，请联系您的专属管理员。',
  announcement_enabled: true,
  admin_contact_url: 'https://t.me/TKJZYL',
  admin_contact_label: '联系管理员 @TKJZYL',
  guest_banner_enabled: true,
  guest_banner_text: '⚠️ 您当前为游客身份，无法创建短链。联系管理员可免费试用！点击此处联系管理员开通权限！',
  guest_banner_color: 'yellow',
  expiry_banner_enabled: true,
  expired_banner_text: '🚨 您的账号已到期或未分配使用时间，已停止服务！点击此处联系管理员立即续费！',
  expiring_banner_text: '⏳ 您的账号还有 {time} 到期，为了防止业务中断，请提前联系管理员续费！',
  global_banner_enabled: false,
  global_banner_text: '',
  global_banner_color: 'blue',
}

/** Verify caller is a root/root_admin or the ROOT_ADMIN_EMAIL. Returns user or null. */
async function requireRootAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  if (user.email === ROOT_ADMIN_EMAIL) return user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !(['root', 'root_admin'] as string[]).includes(profile.role)) return null
  return user
}

type SiteSettingsRow = typeof DEFAULT_SETTINGS & { id?: number; updated_at?: string }

// GET /api/admin/settings — fetch site settings (public, no auth required)
export async function GET() {
  const adminSupabase = createAdminClient()
  const { data, error } = await adminSupabase
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) {
    return NextResponse.json(DEFAULT_SETTINGS)
  }

  const row = data as unknown as SiteSettingsRow

  return NextResponse.json({
    announcement_text: row.announcement_text || DEFAULT_SETTINGS.announcement_text,
    announcement_enabled: row.announcement_enabled ?? DEFAULT_SETTINGS.announcement_enabled,
    admin_contact_url: row.admin_contact_url || DEFAULT_SETTINGS.admin_contact_url,
    admin_contact_label: row.admin_contact_label || DEFAULT_SETTINGS.admin_contact_label,
    guest_banner_enabled: row.guest_banner_enabled ?? DEFAULT_SETTINGS.guest_banner_enabled,
    guest_banner_text: row.guest_banner_text || DEFAULT_SETTINGS.guest_banner_text,
    guest_banner_color: row.guest_banner_color || DEFAULT_SETTINGS.guest_banner_color,
    expiry_banner_enabled: row.expiry_banner_enabled ?? DEFAULT_SETTINGS.expiry_banner_enabled,
    expired_banner_text: row.expired_banner_text || DEFAULT_SETTINGS.expired_banner_text,
    expiring_banner_text: row.expiring_banner_text || DEFAULT_SETTINGS.expiring_banner_text,
    global_banner_enabled: row.global_banner_enabled ?? DEFAULT_SETTINGS.global_banner_enabled,
    global_banner_text: row.global_banner_text || DEFAULT_SETTINGS.global_banner_text,
    global_banner_color: row.global_banner_color || DEFAULT_SETTINGS.global_banner_color,
  })
}

// PUT /api/admin/settings — update site settings (root admin only)
export async function PUT(request: NextRequest) {
  const adminUser = await requireRootAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json()
  const {
    announcement_text,
    announcement_enabled,
    admin_contact_url,
    admin_contact_label,
    guest_banner_enabled,
    guest_banner_text,
    guest_banner_color,
    expiry_banner_enabled,
    expired_banner_text,
    expiring_banner_text,
    global_banner_enabled,
    global_banner_text,
    global_banner_color,
  } = body

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
  if (guest_banner_text !== undefined && (typeof guest_banner_text !== 'string' || guest_banner_text.length > 500)) {
    return NextResponse.json({ error: '游客横幅文字不能超过 500 字符' }, { status: 400 })
  }
  if (expired_banner_text !== undefined && (typeof expired_banner_text !== 'string' || expired_banner_text.length > 500)) {
    return NextResponse.json({ error: '到期横幅文字不能超过 500 字符' }, { status: 400 })
  }
  if (expiring_banner_text !== undefined && (typeof expiring_banner_text !== 'string' || expiring_banner_text.length > 500)) {
    return NextResponse.json({ error: '即将到期横幅文字不能超过 500 字符' }, { status: 400 })
  }
  if (global_banner_text !== undefined && (typeof global_banner_text !== 'string' || global_banner_text.length > 500)) {
    return NextResponse.json({ error: '统一推送横幅文字不能超过 500 字符' }, { status: 400 })
  }

  const ALLOWED_COLORS = ['yellow', 'orange', 'green', 'blue', 'red', 'purple']
  if (guest_banner_color !== undefined && !ALLOWED_COLORS.includes(guest_banner_color)) {
    return NextResponse.json({ error: '无效的横幅颜色' }, { status: 400 })
  }
  if (global_banner_color !== undefined && !ALLOWED_COLORS.includes(global_banner_color)) {
    return NextResponse.json({ error: '无效的横幅颜色' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('site_settings')
    .upsert({
      id: 1,
      announcement_text: announcement_text ?? DEFAULT_SETTINGS.announcement_text,
      announcement_enabled: announcement_enabled ?? DEFAULT_SETTINGS.announcement_enabled,
      admin_contact_url: admin_contact_url ?? DEFAULT_SETTINGS.admin_contact_url,
      admin_contact_label: admin_contact_label ?? DEFAULT_SETTINGS.admin_contact_label,
      guest_banner_enabled: guest_banner_enabled ?? DEFAULT_SETTINGS.guest_banner_enabled,
      guest_banner_text: guest_banner_text ?? DEFAULT_SETTINGS.guest_banner_text,
      guest_banner_color: guest_banner_color ?? DEFAULT_SETTINGS.guest_banner_color,
      expiry_banner_enabled: expiry_banner_enabled ?? DEFAULT_SETTINGS.expiry_banner_enabled,
      expired_banner_text: expired_banner_text ?? DEFAULT_SETTINGS.expired_banner_text,
      expiring_banner_text: expiring_banner_text ?? DEFAULT_SETTINGS.expiring_banner_text,
      global_banner_enabled: global_banner_enabled ?? DEFAULT_SETTINGS.global_banner_enabled,
      global_banner_text: global_banner_text ?? DEFAULT_SETTINGS.global_banner_text,
      global_banner_color: global_banner_color ?? DEFAULT_SETTINGS.global_banner_color,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
