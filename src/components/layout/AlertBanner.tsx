'use client'

import useSWR from 'swr'

interface AlertBannerProps {
  role: string
  expiresAt: string | null
  email: string | null
}

const EXEMPT_EMAIL = 'bolong6233@gmail.com'
const DEFAULT_CONTACT_URL = 'https://t.me/TKJZYL'

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
  const { data: contactUrl = DEFAULT_CONTACT_URL } = useSWR<string>(
    'alertBannerContactUrl',
    async () => {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) return DEFAULT_CONTACT_URL
      const data = await res.json()
      return data.admin_contact_url || DEFAULT_CONTACT_URL
    },
    { revalidateOnFocus: false }
  )

  // Exempt: root admin email and admin/root roles
  if (email === EXEMPT_EMAIL) return null
  if (role === 'admin' || role === 'root' || role === 'root_admin') return null

  const now = new Date()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // Condition 1: Guest
  if (role === 'guest') {
    return (
      <a
        href={sanitizeUrl(contactUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full bg-yellow-400 text-yellow-900 text-sm font-medium text-center px-4 py-2.5 hover:bg-yellow-500 transition-colors"
      >
        ⚠️ 您当前为游客身份，无法创建短链。联系管理员可免费试用！点击此处联系管理员开通权限！
      </a>
    )
  }

  // Conditions 2 & 3: agent role
  if (role === 'agent') {
    const expiryDate = expiresAt ? new Date(expiresAt) : null

    // Condition 2: Expired or no time
    if (!expiryDate || expiryDate < now) {
      return (
        <a
          href={sanitizeUrl(contactUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-red-600 text-white text-sm font-medium text-center px-4 py-2.5 hover:bg-red-700 transition-colors"
        >
          🚨 您的账号已到期或未分配使用时间，已停止服务！点击此处联系管理员立即续费！
        </a>
      )
    }

    // Condition 3: Expiring within 3 days
    if (expiryDate <= threeDaysFromNow) {
      const msLeft = expiryDate.getTime() - now.getTime()
      const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24))
      const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60))
      const timeLabel = daysLeft >= 1 ? `${daysLeft} 天` : `${hoursLeft} 小时`
      return (
        <a
          href={sanitizeUrl(contactUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-orange-500 text-white text-sm font-medium text-center px-4 py-2.5 hover:bg-orange-600 transition-colors"
        >
          ⏳ 您的账号还有 {timeLabel} 到期，为了防止业务中断，请提前联系管理员续费！
        </a>
      )
    }
  }

  return null
}
