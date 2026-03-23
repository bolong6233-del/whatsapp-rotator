'use client'

/*
 * 访问记录 / IP Tracking page
 *
 * Required Supabase SQL (run once in Supabase SQL Editor if upgrading an
 * existing database – new installs use schema.sql which already includes them):
 *
 *   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS city TEXT;
 *   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS os TEXT;
 *   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS browser TEXT;
 *   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS device_type TEXT;
 */

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { ClickLog } from '@/types'
import Pagination from '@/components/ui/Pagination'

interface ShortLinkOption {
  id: string
  slug: string
  title: string | null
}

/** Searchable dropdown for selecting a short link filter. */
function ShortLinkSelect({
  options,
  value,
  onChange,
}: {
  options: ShortLinkOption[]
  value: string
  onChange: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = options.filter((o) => {
    const q = search.toLowerCase()
    return (
      o.slug.toLowerCase().includes(q) ||
      (o.title && o.title.toLowerCase().includes(q))
    )
  })

  const selectedOption = options.find((o) => o.slug === value)
  const displayLabel = selectedOption
    ? `${selectedOption.title ? `${selectedOption.title} · ` : ''}${selectedOption.slug}`
    : '全部短链'

  return (
    <div ref={ref} className="relative min-w-56">
      <button
        type="button"
        onClick={() => { setOpen((prev) => !prev); setSearch('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{displayLabel}</span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索短链..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${!value ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
              >
                全部短链
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.slug); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors ${value === o.slug ? 'text-green-600 font-medium bg-green-50' : 'text-gray-700'}`}
                  >
                    <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded mr-1.5">{o.slug}</span>
                    {o.title && <span className="text-gray-500">{o.title}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Shorten a referer URL to its hostname (or a friendly label). */
function formatReferer(referer: string | null): string {
  if (!referer) return '直接访问'
  try {
    const url = new URL(referer)
    const host = url.hostname.replace(/^www\./, '')
    return host || referer
  } catch {
    return referer
  }
}

/** Small coloured badge. */
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
    >
      {label}
    </span>
  )
}

function OsBadge({ os }: { os: string | null }) {
  if (!os) return <span className="text-gray-400">-</span>
  const map: Record<string, string> = {
    iOS: 'bg-gray-100 text-gray-700',
    iPadOS: 'bg-gray-100 text-gray-700',
    Android: 'bg-green-100 text-green-700',
    Windows: 'bg-blue-100 text-blue-700',
    macOS: 'bg-purple-100 text-purple-700',
    Linux: 'bg-yellow-100 text-yellow-700',
  }
  return <Badge label={os} color={map[os] ?? 'bg-gray-100 text-gray-600'} />
}

function BrowserBadge({ browser }: { browser: string | null }) {
  if (!browser) return <span className="text-gray-400">-</span>
  const map: Record<string, string> = {
    Chrome: 'bg-yellow-100 text-yellow-700',
    Safari: 'bg-blue-100 text-blue-700',
    Firefox: 'bg-orange-100 text-orange-700',
    Edge: 'bg-indigo-100 text-indigo-700',
    Opera: 'bg-red-100 text-red-700',
    Samsung: 'bg-teal-100 text-teal-700',
  }
  return <Badge label={browser} color={map[browser] ?? 'bg-gray-100 text-gray-600'} />
}

function DeviceBadge({ device }: { device: string | null }) {
  if (!device) return <span className="text-gray-400">-</span>
  if (device === 'Mobile') return <Badge label="📱 手机" color="bg-pink-100 text-pink-700" />
  if (device === 'Tablet') return <Badge label="📟 平板" color="bg-purple-100 text-purple-700" />
  return <Badge label="🖥️ 电脑" color="bg-blue-100 text-blue-700" />
}

interface Stats {
  todayCount: number
  mobileCount: number
  desktopCount: number
  topCountry: string | null
}

export default function LogsPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filterSlug, setFilterSlug] = useState('')

  const { data: userInfo } = useSWR('logsCurrentUser', async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const role = profile?.role
    return {
      userId: user.id,
      isAdmin: role === 'admin' || role === 'root' || role === 'root_admin',
    }
  })

  const currentUserId = userInfo?.userId ?? null
  const isAdmin = userInfo?.isAdmin ?? false

  const { data: shortLinks = [] } = useSWR<ShortLinkOption[]>(
    currentUserId !== null ? ['shortLinks', currentUserId, isAdmin] : null,
    async ([, uid, admin]: [string, string, boolean]) => {
      let query = supabase
        .from('short_links')
        .select('id, slug, title')
        .order('created_at', { ascending: false })
      if (!admin) {
        query = query.eq('user_id', uid)
      }
      const { data } = await query
      return (data as ShortLinkOption[]) || []
    },
    { revalidateOnFocus: false }
  )

  const { data: logsData, isValidating: logsValidating } = useSWR(
    currentUserId !== null ? ['logs', page, pageSize, filterSlug, currentUserId, isAdmin] : null,
    async ([, p, ps, slug, uid, admin]: [string, number, number, string, string, boolean]) => {
      const from = (p - 1) * ps
      const to = from + ps - 1
      const selectStr = admin
        ? '*, short_links!inner(slug, title)'
        : '*, short_links!inner(slug, title, user_id)'
      let query = supabase
        .from('click_logs')
        .select(selectStr, { count: 'exact' })
        .order('clicked_at', { ascending: false })
        .range(from, to)
      if (!admin) {
        query = query.eq('short_links.user_id', uid)
      }
      if (slug) {
        query = query.eq('short_links.slug', slug)
      }
      const { data, count, error } = await query
      if (error) throw error
      return { logs: (data as ClickLog[]) || [], totalCount: count || 0 }
    },
    { keepPreviousData: true, revalidateOnFocus: true }
  )

  const logs = logsData?.logs ?? []
  const totalCount = logsData?.totalCount ?? 0
  const loading = !logsData && logsValidating

  const { data: stats } = useSWR<Stats>(
    currentUserId !== null ? ['logsStats', filterSlug, currentUserId, isAdmin] : null,
    async ([, slug, uid, admin]: [string, string, string, boolean]) => {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      // Build shared select string based on user role + slug filter
      const slParts: string[] = []
      if (!admin) slParts.push('user_id')
      if (slug) slParts.push('slug')
      const needsJoin = slParts.length > 0
      const countSelect = needsJoin ? `id, short_links!inner(${slParts.join(', ')})` : 'id'
      const countrySelect = needsJoin ? `country, short_links!inner(${slParts.join(', ')})` : 'country'

      const buildTodayQ = () => {
        let q = supabase
          .from('click_logs')
          .select(countSelect, { count: 'exact', head: true })
          .gte('clicked_at', todayStart.toISOString())
        if (!admin) q = q.eq('short_links.user_id', uid)
        if (slug) q = q.eq('short_links.slug', slug)
        return q
      }
      const buildMobileQ = () => {
        let q = supabase
          .from('click_logs')
          .select(countSelect, { count: 'exact', head: true })
          .in('device_type', ['Mobile', 'Tablet'])
        if (!admin) q = q.eq('short_links.user_id', uid)
        if (slug) q = q.eq('short_links.slug', slug)
        return q
      }
      const buildDesktopQ = () => {
        let q = supabase
          .from('click_logs')
          .select(countSelect, { count: 'exact', head: true })
          .eq('device_type', 'Desktop')
        if (!admin) q = q.eq('short_links.user_id', uid)
        if (slug) q = q.eq('short_links.slug', slug)
        return q
      }
      const buildCountryQ = () => {
        let q = supabase
          .from('click_logs')
          .select(countrySelect)
          .not('country', 'is', null)
          .limit(2000)
        if (!admin) q = q.eq('short_links.user_id', uid)
        if (slug) q = q.eq('short_links.slug', slug)
        return q
      }

      const [todayRes, mobileRes, desktopRes, countryRes] = await Promise.all([
        buildTodayQ(),
        buildMobileQ(),
        buildDesktopQ(),
        buildCountryQ(),
      ])

      const todayCount = todayRes.count ?? 0
      const mobileCount = mobileRes.count ?? 0
      const desktopCount = desktopRes.count ?? 0

      let topCountry: string | null = null
      if (countryRes.data) {
        const freq: Record<string, number> = {}
        for (const row of (countryRes.data as unknown as { country: string | null }[])) {
          if (row.country) freq[row.country] = (freq[row.country] ?? 0) + 1
        }
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
        topCountry = sorted[0]?.[0] ?? null
      }

      return { todayCount, mobileCount, desktopCount, topCountry }
    },
    { keepPreviousData: true, revalidateOnFocus: true }
  )

  const handleFilterChange = (slug: string) => {
    setFilterSlug(slug)
    setPage(1)
  }

  const mobileRatio =
    stats && stats.mobileCount + stats.desktopCount > 0
      ? Math.round((stats.mobileCount / (stats.mobileCount + stats.desktopCount)) * 100)
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">访问记录</h1>
        <span className="text-sm text-gray-500">共 {totalCount} 条记录</span>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">
            今日点击{filterSlug && <span className="ml-1 text-green-600">· {filterSlug}</span>}
          </p>
          <p className="text-3xl font-bold text-gray-900">{stats?.todayCount ?? '—'}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">
            手机端占比{filterSlug && <span className="ml-1 text-green-600">· {filterSlug}</span>}
          </p>
          <p className="text-3xl font-bold text-gray-900">
            {mobileRatio !== null ? `${mobileRatio}%` : '—'}
          </p>
          {stats && (
            <p className="text-xs text-gray-400 mt-1">
              手机 {stats.mobileCount} · 电脑 {stats.desktopCount}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">
            最多访问国家{filterSlug && <span className="ml-1 text-green-600">· {filterSlug}</span>}
          </p>
          <p className="text-3xl font-bold text-gray-900">{stats?.topCountry ?? '—'}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 flex-wrap">
        <ShortLinkSelect
          options={shortLinks}
          value={filterSlug}
          onChange={handleFilterChange}
        />
        {filterSlug && (
          <button
            onClick={() => handleFilterChange('')}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            重置
          </button>
        )}
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-gray-500">加载中...</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-gray-400 text-sm">暂无访问记录</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-3 px-4 font-medium">访问时间</th>
                  <th className="py-3 px-4 font-medium">短链</th>
                  <th className="py-3 px-4 font-medium">访客位置</th>
                  <th className="py-3 px-4 font-medium">IP 地址</th>
                  <th className="py-3 px-4 font-medium">设备</th>
                  <th className="py-3 px-4 font-medium">操作系统</th>
                  <th className="py-3 px-4 font-medium">浏览器</th>
                  <th className="py-3 px-4 font-medium">来源</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {formatDate(log.clicked_at)}
                    </td>
                    <td className="py-3 px-4">
                      {log.short_links ? (
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                          {log.short_links.slug}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                      {log.short_links?.title && (
                        <span className="ml-2 text-gray-500 text-xs">{log.short_links.title}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      {log.country || log.city
                        ? [log.country, log.city].filter(Boolean).join(' · ')
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs whitespace-nowrap">
                      {log.ip_address || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <DeviceBadge device={log.device_type ?? null} />
                    </td>
                    <td className="py-3 px-4">
                      <OsBadge os={log.os ?? null} />
                    </td>
                    <td className="py-3 px-4">
                      <BrowserBadge browser={log.browser ?? null} />
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs max-w-[160px] truncate"
                        title={log.referer ?? ''}>
                      {formatReferer(log.referer ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-gray-100">
          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
          />
        </div>
      </div>
    </div>
  )
}
