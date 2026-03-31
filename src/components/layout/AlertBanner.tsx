'use client'

import useSWR from 'swr'

interface AlertBannerProps {
  role: string
  expiresAt: string | null
  email: string | null
}

interface SiteSettings {
  admin_contact_url: string
  announcement_enabled: boolean
  guest_banner_enabled: boolean
  guest_banner_text: string
  guest_banner_color: string
  expiry_banner_enabled: boolean
  expired_banner_text: string
  expiring_banner_text: string
  global_banner_enabled: boolean
  global_banner_text: string
  global_banner_color: string
}

const EXEMPT_EMAIL = 'bolong6233@gmail.com'
const DEFAULT_CONTACT_URL = 'https://t.me/TKJZYL'

const DEFAULT_SETTINGS: SiteSettings = {
  admin_contact_url: DEFAULT_CONTACT_URL,
  announcement_enabled: true,
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

type ColorConfig = { bg: string; text: string; hover: string }

const COLOR_MAP: Record<string, ColorConfig> = {
  yellow: { bg: 'bg-yellow-400', text: 'text-yellow-900', hover: 'hover:bg-yellow-500' },
  orange: { bg: 'bg-orange-500', text: 'text-white', hover: 'hover:bg-orange-600' },
  green:  { bg: 'bg-green-500',  text: 'text-white', hover: 'hover:bg-green-600' },
  blue:   { bg: 'bg-blue-500',   text: 'text-white', hover: 'hover:bg-blue-600' },
  red:    { bg: 'bg-red-600',    text: 'text-white', hover: 'hover:bg-red-700' },
  purple: { bg: 'bg-purple-600', text: 'text-white', hover: 'hover:bg-purple-700' },
}

function getColorClass(color: string): ColorConfig {
  return COLOR_MAP[color] ?? COLOR_MAP['blue']
}

/** Sanitize a URL to only allow http/https/tg protocols. Returns '#' for unsafe URLs. */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (['http:', 'https:', 'tg:'].includes(parsed.protocol)) {
      return parsed.href
    }
  } catch {
    // invalid URL
  }
  return '#'
}

export default function AlertBanner({ role, expiresAt, email }: AlertBannerProps) {
  const { data: settings = DEFAULT_SETTINGS } = useSWR<SiteSettings>(
    'alertBannerSettings',
    async () => {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) return DEFAULT_SETTINGS
      const data = await res.json()
      return {
        admin_contact_url: data.admin_contact_url || DEFAULT_SETTINGS.admin_contact_url,
        announcement_enabled: data.announcement_enabled ?? DEFAULT_SETTINGS.announcement_enabled,
        guest_banner_enabled: data.guest_banner_enabled ?? DEFAULT_SETTINGS.guest_banner_enabled,
        guest_banner_text: data.guest_banner_text || DEFAULT_SETTINGS.guest_banner_text,
        guest_banner_color: data.guest_banner_color || DEFAULT_SETTINGS.guest_banner_color,
        expiry_banner_enabled: data.expiry_banner_enabled ?? DEFAULT_SETTINGS.expiry_banner_enabled,
        expired_banner_text: data.expired_banner_text || DEFAULT_SETTINGS.expired_banner_text,
        expiring_banner_text: data.expiring_banner_text || DEFAULT_SETTINGS.expiring_banner_text,
        global_banner_enabled: data.global_banner_enabled ?? DEFAULT_SETTINGS.global_banner_enabled,
        global_banner_text: data.global_banner_text || DEFAULT_SETTINGS.global_banner_text,
        global_banner_color: data.global_banner_color || DEFAULT_SETTINGS.global_banner_color,
      }
    },
    { revalidateOnFocus: false }
  )

  // Exempt: root admin email and admin/root roles
  if (email === EXEMPT_EMAIL) return null
  if (role === 'admin' || role === 'root' || role === 'root_admin') return null

  const contactEnabled = settings.announcement_enabled
  const contactUrl = sanitizeUrl(settings.admin_contact_url)

  // Global banner has highest priority — shown to all non-admin users
  if (settings.global_banner_enabled && settings.global_banner_text) {
    const colors = getColorClass(settings.global_banner_color)
    if (contactEnabled) {
      return (
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`block w-full ${colors.bg} ${colors.text} text-sm font-medium text-center px-4 py-2.5 ${colors.hover} transition-colors`}
        >
          {settings.global_banner_text}
        </a>
      )
    }
    return (
      <div className={`block w-full ${colors.bg} ${colors.text} text-sm font-medium text-center px-4 py-2.5`}>
        {settings.global_banner_text}
      </div>
    )
  }

  const now = new Date()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // Guest banner
  if (role === 'guest' && settings.guest_banner_enabled) {
    const colors = getColorClass(settings.guest_banner_color)
    if (contactEnabled) {
      return (
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`block w-full ${colors.bg} ${colors.text} text-sm font-medium text-center px-4 py-2.5 ${colors.hover} transition-colors`}
        >
          {settings.guest_banner_text}
        </a>
      )
    }
    return (
      <div className={`block w-full ${colors.bg} ${colors.text} text-sm font-medium text-center px-4 py-2.5`}>
        {settings.guest_banner_text}
      </div>
    )
  }

  // Expiry banners for agent role
  if (role === 'agent' && settings.expiry_banner_enabled) {
    const expiryDate = expiresAt ? new Date(expiresAt) : null

    // Expired or no time assigned
    if (!expiryDate || expiryDate < now) {
      if (contactEnabled) {
        return (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-red-600 text-white text-sm font-medium text-center px-4 py-2.5 hover:bg-red-700 transition-colors"
          >
            {settings.expired_banner_text}
          </a>
        )
      }
      return (
        <div className="block w-full bg-red-600 text-white text-sm font-medium text-center px-4 py-2.5">
          {settings.expired_banner_text}
        </div>
      )
    }

    // Expiring within 3 days
    if (expiryDate <= threeDaysFromNow) {
      const msLeft = expiryDate.getTime() - now.getTime()
      const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24))
      const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60))
      const timeLabel = daysLeft >= 1 ? `${daysLeft} 天` : `${hoursLeft} 小时`
      const bannerText = settings.expiring_banner_text.replace('{time}', timeLabel)
      if (contactEnabled) {
        return (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-orange-500 text-white text-sm font-medium text-center px-4 py-2.5 hover:bg-orange-600 transition-colors"
          >
            {bannerText}
          </a>
        )
      }
      return (
        <div className="block w-full bg-orange-500 text-white text-sm font-medium text-center px-4 py-2.5">
          {bannerText}
        </div>
      )
    }
  }

  return null
}
