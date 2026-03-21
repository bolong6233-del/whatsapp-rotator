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

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { ClickLog } from '@/types'
import Pagination from '@/components/ui/Pagination'

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
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
  const [logs, setLogs] = useState<ClickLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filterSlug, setFilterSlug] = useState('')
  const [filterSlugInput, setFilterSlugInput] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)

  const fetchStats = useCallback(async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Use count-only queries for device types to avoid fetching all rows
    const [todayRes, mobileRes, desktopRes, countryRes] = await Promise.all([
      supabase
        .from('click_logs')
        .select('id', { count: 'exact', head: true })
        .gte('clicked_at', todayStart.toISOString()),
      supabase
        .from('click_logs')
        .select('id', { count: 'exact', head: true })
        .in('device_type', ['Mobile', 'Tablet']),
      supabase
        .from('click_logs')
        .select('id', { count: 'exact', head: true })
        .eq('device_type', 'Desktop'),
      // Fetch a bounded list of non-null countries and aggregate client-side
      // (Supabase JS client doesn't support GROUP BY directly without RPC)
      supabase
        .from('click_logs')
        .select('country')
        .not('country', 'is', null)
        .limit(2000),
    ])

    const todayCount = todayRes.count ?? 0
    const mobileCount = mobileRes.count ?? 0
    const desktopCount = desktopRes.count ?? 0

    let topCountry: string | null = null
    if (countryRes.data) {
      const freq: Record<string, number> = {}
      for (const row of countryRes.data as { country: string | null }[]) {
        if (row.country) freq[row.country] = (freq[row.country] ?? 0) + 1
      }
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
      topCountry = sorted[0]?.[0] ?? null
    }

    setStats({ todayCount, mobileCount, desktopCount, topCountry })
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('click_logs')
      .select('*, short_links!inner(slug, title)', { count: 'exact' })
      .order('clicked_at', { ascending: false })
      .range(from, to)

    if (filterSlug) {
      query = query.ilike('short_links.slug', `%${escapeLikePattern(filterSlug)}%`)
    }

    const { data, count, error } = await query

    if (!error) {
      setLogs((data as ClickLog[]) || [])
      setTotalCount(count || 0)
    }
    setLoading(false)
  }, [page, pageSize, filterSlug])

  useEffect(() => {
    fetchLogs()
    fetchStats()
  }, [fetchLogs, fetchStats])

  const handleSearch = () => {
    setFilterSlug(filterSlugInput.trim())
    setPage(1)
  }

  const handleReset = () => {
    setFilterSlugInput('')
    setFilterSlug('')
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
          <p className="text-xs text-gray-500 mb-1">今日点击</p>
          <p className="text-3xl font-bold text-gray-900">{stats?.todayCount ?? '—'}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">手机端占比</p>
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
          <p className="text-xs text-gray-500 mb-1">最多访问国家</p>
          <p className="text-3xl font-bold text-gray-900">{stats?.topCountry ?? '—'}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={filterSlugInput}
          onChange={(e) => setFilterSlugInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索短链后缀..."
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
        >
          搜索
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          重置
        </button>
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
