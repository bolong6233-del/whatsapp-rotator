'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'
import { useToast } from '@/context/ToastContext'

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

interface SiteSettings {
  announcement_text: string
  admin_contact_url: string
  admin_contact_label: string
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

const DEFAULT_SETTINGS: SiteSettings = {
  announcement_text: '如需提升短链配额或遇到问题，请联系您的专属管理员。',
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

const GUEST_COLOR_OPTIONS = [
  { value: 'yellow', label: '黄色', bg: 'bg-yellow-400' },
  { value: 'orange', label: '橙色', bg: 'bg-orange-400' },
  { value: 'green',  label: '绿色', bg: 'bg-green-500' },
  { value: 'blue',   label: '蓝色', bg: 'bg-blue-500' },
]

const GLOBAL_COLOR_OPTIONS = [
  { value: 'blue',   label: '蓝色',   bg: 'bg-blue-500' },
  { value: 'green',  label: '绿色',   bg: 'bg-green-500' },
  { value: 'red',    label: '红色',   bg: 'bg-red-600' },
  { value: 'purple', label: '紫色',   bg: 'bg-purple-600' },
  { value: 'orange', label: '橙色',   bg: 'bg-orange-500' },
]

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        enabled ? 'bg-blue-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function ColorPicker({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; bg: string }[]
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all ${
            value === opt.value
              ? 'border-gray-800 scale-105'
              : 'border-transparent hover:border-gray-400'
          }`}
        >
          <span className={`inline-block w-3 h-3 rounded-full ${opt.bg}`} />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [announcementText, setAnnouncementText] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [contactLabel, setContactLabel] = useState('')

  const [guestBannerEnabled, setGuestBannerEnabled] = useState(true)
  const [guestBannerText, setGuestBannerText] = useState('')
  const [guestBannerColor, setGuestBannerColor] = useState('yellow')

  const [expiryBannerEnabled, setExpiryBannerEnabled] = useState(true)
  const [expiredBannerText, setExpiredBannerText] = useState('')
  const [expiringBannerText, setExpiringBannerText] = useState('')

  const [globalBannerEnabled, setGlobalBannerEnabled] = useState(false)
  const [globalBannerText, setGlobalBannerText] = useState('')
  const [globalBannerColor, setGlobalBannerColor] = useState('blue')

  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Verify admin access
  const { data: isAdmin, isLoading: checkingAuth } = useSWR(
    'settingsPageAuth',
    async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false
      if (user.email === ROOT_ADMIN_EMAIL) return true
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      return ['admin', 'root', 'root_admin'].includes(profile?.role ?? '')
    },
    { revalidateOnFocus: false }
  )

  const { data: settings, mutate: mutateSettings } = useSWR<SiteSettings>(
    'adminSiteSettings',
    async () => {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) return DEFAULT_SETTINGS
      return res.json()
    },
    { revalidateOnFocus: false }
  )

  useEffect(() => {
    if (settings && !initialized) {
      setAnnouncementText(settings.announcement_text)
      setContactUrl(settings.admin_contact_url)
      setContactLabel(settings.admin_contact_label)
      setGuestBannerEnabled(settings.guest_banner_enabled ?? true)
      setGuestBannerText(settings.guest_banner_text || DEFAULT_SETTINGS.guest_banner_text)
      setGuestBannerColor(settings.guest_banner_color || 'yellow')
      setExpiryBannerEnabled(settings.expiry_banner_enabled ?? true)
      setExpiredBannerText(settings.expired_banner_text || DEFAULT_SETTINGS.expired_banner_text)
      setExpiringBannerText(settings.expiring_banner_text || DEFAULT_SETTINGS.expiring_banner_text)
      setGlobalBannerEnabled(settings.global_banner_enabled ?? false)
      setGlobalBannerText(settings.global_banner_text || '')
      setGlobalBannerColor(settings.global_banner_color || 'blue')
      setInitialized(true)
    }
  }, [settings, initialized])

  useEffect(() => {
    if (!checkingAuth && isAdmin === false) {
      router.replace('/dashboard')
    }
  }, [isAdmin, checkingAuth, router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          announcement_text: announcementText,
          admin_contact_url: contactUrl,
          admin_contact_label: contactLabel,
          guest_banner_enabled: guestBannerEnabled,
          guest_banner_text: guestBannerText,
          guest_banner_color: guestBannerColor,
          expiry_banner_enabled: expiryBannerEnabled,
          expired_banner_text: expiredBannerText,
          expiring_banner_text: expiringBannerText,
          global_banner_enabled: globalBannerEnabled,
          global_banner_text: globalBannerText,
          global_banner_color: globalBannerColor,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error || '保存失败', 'error')
      } else {
        showToast('设置已保存', 'success')
        await mutateSettings()
      }
    } catch {
      showToast('保存失败，请稍后重试', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        验证权限中...
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">公告设置</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Banner settings */}
          <div className="space-y-6">
            {/* Guest Banner */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  👤 游客横幅
                </h2>
                <Toggle enabled={guestBannerEnabled} onChange={setGuestBannerEnabled} />
              </div>
              <div className={`space-y-4 transition-opacity ${guestBannerEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    横幅文字
                  </label>
                  <textarea
                    value={guestBannerText}
                    onChange={(e) => setGuestBannerText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    背景颜色
                  </label>
                  <ColorPicker value={guestBannerColor} onChange={setGuestBannerColor} options={GUEST_COLOR_OPTIONS} />
                </div>
              </div>
            </div>

            {/* Expiry Banner */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  ⏰ 到期横幅
                </h2>
                <Toggle enabled={expiryBannerEnabled} onChange={setExpiryBannerEnabled} />
              </div>
              <div className={`space-y-4 transition-opacity ${expiryBannerEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    已到期文字
                  </label>
                  <textarea
                    value={expiredBannerText}
                    onChange={(e) => setExpiredBannerText(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    即将到期文字
                    <span className="ml-1 text-xs text-gray-400 font-normal">（使用 {'{time}'} 代表剩余时间）</span>
                  </label>
                  <textarea
                    value={expiringBannerText}
                    onChange={(e) => setExpiringBannerText(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Global Banner */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  📣 统一横幅推送
                </h2>
                <Toggle enabled={globalBannerEnabled} onChange={setGlobalBannerEnabled} />
              </div>
              {globalBannerEnabled && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  ⚠️ 启用后，所有非管理员用户（包括代理和游客）都会看到此横幅，优先级最高
                </p>
              )}
              <div className={`space-y-4 transition-opacity ${globalBannerEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    横幅文字
                  </label>
                  <textarea
                    value={globalBannerText}
                    onChange={(e) => setGlobalBannerText(e.target.value)}
                    rows={2}
                    placeholder="输入要推送给所有用户的横幅内容..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    背景颜色
                  </label>
                  <ColorPicker value={globalBannerColor} onChange={setGlobalBannerColor} options={GLOBAL_COLOR_OPTIONS} />
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Announcement & Contact */}
          <div className="space-y-6">
            {/* Announcement */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-5 flex items-center gap-2">
                📢 系统公告
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    公告内容
                  </label>
                  <textarea
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    rows={4}
                    placeholder="输入系统公告内容..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">此公告将显示在所有用户的个人中心页面</p>
                </div>
              </div>
            </div>

            {/* Contact Admin */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-5 flex items-center gap-2">
                📲 联系管理员设置
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    联系链接（URL）
                  </label>
                  <input
                    type="url"
                    value={contactUrl}
                    onChange={(e) => setContactUrl(e.target.value)}
                    placeholder="https://t.me/username"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">点击联系管理员按钮时跳转的链接</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    按钮显示文字
                  </label>
                  <input
                    type="text"
                    value={contactLabel}
                    onChange={(e) => setContactLabel(e.target.value)}
                    placeholder="联系管理员 @username"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">在个人中心页面联系按钮上显示的文字</p>
                </div>
                {contactUrl && (
                  <div className="pt-2">
                    <p className="text-xs text-gray-500 mb-2">预览效果：</p>
                    <a
                      href={sanitizeUrl(contactUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.981l-2.965-.924c-.644-.203-.658-.644.136-.953l11.57-4.461c.537-.194 1.006.131.963.578z" />
                      </svg>
                      {contactLabel || '联系管理员'}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </form>
    </div>
  )
}
