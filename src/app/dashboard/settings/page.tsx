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
}

const DEFAULT_SETTINGS: SiteSettings = {
  announcement_text: '如需提升短链配额或遇到问题，请联系您的专属管理员。',
  admin_contact_url: 'https://t.me/TKJZYL',
  admin_contact_label: '联系管理员 @TKJZYL',
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

export default function SettingsPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [announcementText, setAnnouncementText] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [contactLabel, setContactLabel] = useState('')
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
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>

      <form onSubmit={handleSave} className="space-y-6">
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
