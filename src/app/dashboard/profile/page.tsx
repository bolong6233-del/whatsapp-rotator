'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'

interface ProfileData {
  id: string
  email: string | null
  role: string
  created_at: string
  expires_at: string | null
}

interface StatsData {
  linkCount: number
  numberCount: number
  totalClicks: number
}

interface SiteSettings {
  announcement_text: string
  announcement_enabled: boolean
  admin_contact_url: string
  admin_contact_label: string
}

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

const roleConfig: Record<string, { label: string; color: string }> = {
  root_admin: { label: '超级管理员', color: 'bg-yellow-100 text-yellow-700' },
  root:  { label: '超级管理员', color: 'bg-yellow-100 text-yellow-700' },
  admin: { label: '管理员',    color: 'bg-purple-100 text-purple-700' },
  agent: { label: '高级代理',  color: 'bg-blue-100 text-blue-700' },
  guest: { label: '游客',      color: 'bg-gray-100 text-gray-600' },
}

const DEFAULT_SETTINGS: SiteSettings = {
  announcement_text: '如需提升短链配额或遇到问题，请联系您的专属管理员。',
  announcement_enabled: true,
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

function getInitials(email: string | null): string {
  if (!email) return '?'
  return email.charAt(0).toUpperCase()
}

function daysSince(dateStr: string): number {
  const created = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
}

export default function ProfilePage() {
  const { data: profile, isLoading: isLoadingProfile } = useSWR<ProfileData | null>(
    'myProfile',
    async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, email, role, created_at, expires_at')
        .eq('id', user.id)
        .single()
      if (prof) {
        return {
          ...prof,
          email: prof.email ?? user.email ?? null,
          created_at: prof.created_at ?? user.created_at,
        } as ProfileData
      }
      return {
        id: user.id,
        email: user.email || null,
        role: user.email === ROOT_ADMIN_EMAIL ? 'root_admin' : 'agent',
        created_at: user.created_at,
        expires_at: null,
      }
    }
  )

  const userId = profile?.id ?? null

  const { data: stats = { linkCount: 0, numberCount: 0, totalClicks: 0 } } = useSWR<StatsData>(
    userId ? ['myStats', userId] : null,
    async ([, uid]: [string, string]) => {
      const { data: links } = await supabase
        .from('short_links')
        .select('id, total_clicks')
        .eq('user_id', uid)
      const linkCount = links?.length ?? 0
      const totalClicks = links?.reduce((sum, l) => sum + (l.total_clicks ?? 0), 0) ?? 0
      const { count: numberCount } = await supabase
        .from('whatsapp_numbers')
        .select('id', { count: 'exact', head: true })
        .in('short_link_id', (links ?? []).map((l) => l.id))
      return { linkCount, numberCount: numberCount ?? 0, totalClicks }
    }
  )

  const { data: siteSettings = DEFAULT_SETTINGS } = useSWR<SiteSettings>(
    'siteSettings',
    async () => {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) return DEFAULT_SETTINGS
      const data = await res.json()
      return {
        announcement_text: data.announcement_text || DEFAULT_SETTINGS.announcement_text,
        announcement_enabled: data.announcement_enabled ?? DEFAULT_SETTINGS.announcement_enabled,
        admin_contact_url: data.admin_contact_url || DEFAULT_SETTINGS.admin_contact_url,
        admin_contact_label: data.admin_contact_label || DEFAULT_SETTINGS.admin_contact_label,
      }
    },
    { revalidateOnFocus: false }
  )

  const loadingProfile = !profile && isLoadingProfile

  // Password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < 6) {
      setError('新密码至少需要 6 位字符')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    const res = await fetch('/api/profile/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError('密码修改失败：' + (data.error || '未知错误'))
    } else {
      setSuccess('密码修改成功！')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const isRootAdmin = profile?.email === ROOT_ADMIN_EMAIL
  const roleCfg = isRootAdmin
    ? roleConfig.root_admin
    : (roleConfig[profile?.role ?? 'agent'] ?? roleConfig.agent)
  const days = profile ? daysSince(profile.created_at) : 0
  const now = new Date()
  const expiresAt = profile?.expires_at ? new Date(profile.expires_at) : null
  const isExpired = expiresAt !== null && expiresAt < now

  const formatCreatedAt = (dateStr: string): string => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(dateStr)).replace(/\//g, '-')
  }

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        加载中...
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">个人中心</h1>

      {/* Top row: profile card + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Module 1: Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center text-center">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold mb-4 select-none">
            {getInitials(profile?.email ?? null)}
          </div>
          <p className="text-gray-900 font-semibold text-sm break-all">{profile?.email ?? '–'}</p>
          <span className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleCfg.color}`}>
            {roleCfg.label}
          </span>
          <p className="mt-3 text-xs text-gray-400">
            已加入系统 <span className="font-semibold text-gray-600">{days}</span> 天
          </p>
        </div>

        {/* Module 2: Stats Overview */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between">
            <p className="text-xs text-gray-500 font-medium">我的短链</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.linkCount}</p>
            <p className="text-xs text-gray-400 mt-1">条短链</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between">
            <p className="text-xs text-gray-500 font-medium">我的号码</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.numberCount}</p>
            <p className="text-xs text-gray-400 mt-1">个 WhatsApp 号码</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between">
            <p className="text-xs text-gray-500 font-medium">累计点击</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.totalClicks.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">次点击</p>
          </div>
        </div>
      </div>

      {/* Bottom row: security log + notice + password */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Module 3: Account Information */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5 flex items-center gap-2">
            📋 个人信息
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-50">
              <span className="text-sm text-gray-500">当前账号创建时间</span>
              <span className="text-sm font-medium text-gray-800">
                {profile?.created_at ? formatCreatedAt(profile.created_at) : '–'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">到期时间</span>
              {isRootAdmin ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  永久有效
                </span>
              ) : profile?.expires_at ? (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  isExpired ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {formatCreatedAt(profile.expires_at)}
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                  未分配
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Module 4: System Notice / Contact Admin */}
        {siteSettings.announcement_enabled && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
              📢 系统公告
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {siteSettings.announcement_text}
            </p>
          </div>
          <a
            href={sanitizeUrl(siteSettings.admin_contact_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.981l-2.965-.924c-.644-.203-.658-.644.136-.953l11.57-4.461c.537-.194 1.006.131.963.578z" />
            </svg>
            {siteSettings.admin_contact_label}
          </a>
        </div>
        )}
      </div>

      {/* Password Change */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-lg">
        <h2 className="text-base font-semibold text-gray-800 mb-5">🔒 修改密码</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              新密码 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder="请输入新密码（至少 6 位）"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              确认新密码 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              placeholder="请再次输入新密码"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? '保存中...' : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
