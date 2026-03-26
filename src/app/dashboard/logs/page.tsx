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
 *   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS isp TEXT;
 */

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { ClickLog } from '@/types'
import Pagination from '@/components/ui/Pagination'
import { useTopProgress } from '@/context/ProgressContext'
import { useToast } from '@/context/ToastContext'

interface ShortLinkOption {
  id: string
  slug: string
  title: string | null
}

interface Stats {
  todayCount: number
  mobileCount: number
  desktopCount: number
  topCountry: string | null
  availableCountries: string[]
}

/** Convert a 2-letter ISO country code to its flag emoji. */
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '🌐'
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1f1e6))
    .join('')
}

/** Country code → Chinese name map (common countries). */
const COUNTRY_ZH: Record<string, string> = {
  SG: '新加坡', HK: '中国香港', TW: '中国台湾', MO: '中国澳门',
  CN: '中国', US: '美国', GB: '英国', JP: '日本', KR: '韩国',
  DE: '德国', FR: '法国', IT: '意大利', ES: '西班牙', AU: '澳大利亚',
  CA: '加拿大', RU: '俄罗斯', BR: '巴西', IN: '印度', MX: '墨西哥',
  NL: '荷兰', CH: '瑞士', SE: '瑞典', NO: '挪威', DK: '丹麦',
  FI: '芬兰', PL: '波兰', TR: '土耳其', SA: '沙特阿拉伯', AE: '阿联酋',
  TH: '泰国', MY: '马来西亚', ID: '印度尼西亚', PH: '菲律宾', VN: '越南',
  PK: '巴基斯坦', NG: '尼日利亚', ZA: '南非', EG: '埃及', AR: '阿根廷',
  CL: '智利', CO: '哥伦比亚', PT: '葡萄牙', GR: '希腊', CZ: '捷克',
  HU: '匈牙利', RO: '罗马尼亚', UA: '乌克兰', IL: '以色列', NZ: '新西兰',
  AT: '奥地利', BE: '比利时', IE: '爱尔兰', BD: '孟加拉国', MM: '缅甸',
  KH: '柬埔寨', LA: '老挝', NP: '尼泊尔', LK: '斯里兰卡', MN: '蒙古',
  KZ: '哈萨克斯坦', UZ: '乌兹别克斯坦', KW: '科威特', QA: '卡塔尔',
  BH: '巴林', OM: '阿曼', JO: '约旦', LB: '黎巴嫩', IR: '伊朗',
  IQ: '伊拉克', MA: '摩洛哥', TN: '突尼斯', DZ: '阿尔及利亚', ET: '埃塞俄比亚',
  KE: '肯尼亚', GH: '加纳', TZ: '坦桑尼亚', SN: '塞内加尔',
  PE: '秘鲁', VE: '委内瑞拉', EC: '厄瓜多尔', UY: '乌拉圭', BO: '玻利维亚',
  BG: '保加利亚', HR: '克罗地亚', SK: '斯洛伐克', SI: '斯洛文尼亚',
  LT: '立陶宛', LV: '拉脱维亚', EE: '爱沙尼亚', RS: '塞尔维亚',
}

/** Return display string for a country code: "🇸🇬 SG 新加坡" */
function countryDisplay(code: string | null): string {
  if (!code) return '—'
  const upper = code.toUpperCase()
  const flag = countryFlag(upper)
  const zh = COUNTRY_ZH[upper]
  return zh ? `${flag} ${upper} ${zh}` : `${flag} ${upper}`
}

/** Small coloured badge. */
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function OsBadge({ os }: { os: string | null }) {
  if (!os) return <span className="text-gray-400 text-xs">-</span>
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
  if (!browser) return <span className="text-gray-400 text-xs">-</span>
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
  if (!device) return <span className="text-gray-400 text-xs">-</span>
  if (device === 'Mobile') return <Badge label="📱 手机" color="bg-pink-100 text-pink-700" />
  if (device === 'Tablet') return <Badge label="📟 平板" color="bg-purple-100 text-purple-700" />
  return <Badge label="🖥️ 电脑" color="bg-blue-100 text-blue-700" />
}

/** Two-state source pill: 直接访问 (no referer) or 斗篷 (has referer). */
function SourceBadge({ referer }: { referer: string | null | undefined }) {
  if (!referer) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
        直接访问
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      斗篷
    </span>
  )
}

/** Shared chevron icon for dropdowns. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
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
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
    <div ref={ref} className="relative min-w-52">
      <button
        type="button"
        onClick={() => { setOpen((prev) => !prev); setSearch('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{displayLabel}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索短链..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${!value ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700'}`}
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
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${value === o.slug ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700'}`}
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

/** Dropdown for selecting a country filter (populated from visit data). */
function CountrySelect({
  countries,
  value,
  onChange,
}: {
  countries: string[]
  value: string
  onChange: (country: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = countries.filter((c) => {
    const zh = COUNTRY_ZH[c] ?? ''
    const q = search.toLowerCase()
    return c.toLowerCase().includes(q) || zh.includes(q)
  })

  return (
    <div ref={ref} className="relative min-w-52">
      <button
        type="button"
        onClick={() => { setOpen((p) => !p); setSearch('') }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
      >
        <span className={value ? 'text-gray-800 font-medium' : 'text-gray-500'}>
          {value ? countryDisplay(value) : '全部国家'}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索国家..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${!value ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700'}`}
              >
                全部国家
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => { onChange(c); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${value === c ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700'}`}
                  >
                    {countryDisplay(c)}
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

export default function LogsPage() {
  const { start, done } = useTopProgress()
  const { showToast } = useToast()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filterSlug, setFilterSlug] = useState('')
  const [filterCountry, setFilterCountry] = useState('')

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

  const { data: logsData, isValidating: logsValidating, mutate: mutateLogs } = useSWR(
    currentUserId !== null
      ? ['logs', page, pageSize, filterSlug, filterCountry, currentUserId, isAdmin]
      : null,
    async ([, p, ps, slug, country, uid, admin]: [string, number, number, string, string, string, boolean]) => {
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
      if (country) {
        query = query.eq('country', country)
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
      const availableCountries: string[] = []
      if (countryRes.data) {
        const freq: Record<string, number> = {}
        for (const row of (countryRes.data as unknown as { country: string | null }[])) {
          if (row.country) {
            const code = row.country.toUpperCase()
            freq[code] = (freq[code] ?? 0) + 1
          }
        }
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
        topCountry = sorted[0]?.[0] ?? null
        availableCountries.push(...sorted.map(([c]) => c))
      }

      return { todayCount, mobileCount, desktopCount, topCountry, availableCountries }
    },
    { keepPreviousData: true, revalidateOnFocus: true }
  )

  const handleFilterChange = (slug: string) => {
    setFilterSlug(slug)
    setPage(1)
  }

  const handleCountryChange = (country: string) => {
    setFilterCountry(country)
    setPage(1)
  }

  const handleRefresh = async () => {
    start()
    try {
      await mutateLogs()
    } catch {
      showToast('刷新失败', 'error')
    } finally {
      done()
    }
  }

  const mobileRatio =
    stats && stats.mobileCount + stats.desktopCount > 0
      ? Math.round((stats.mobileCount / (stats.mobileCount + stats.desktopCount)) * 100)
      : null

  const desktopRatio = mobileRatio !== null ? 100 - mobileRatio : null

  const availableCountries = stats?.availableCountries ?? []

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">访问记录</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">共 {totalCount} 条记录</span>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Today clicks */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 ring-1 ring-black/[0.03]">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            今日点击{filterSlug && <span className="ml-1 text-blue-500 normal-case tracking-normal">· {filterSlug}</span>}
          </p>
          <p className="text-3xl font-bold text-gray-900 leading-none">{stats?.todayCount ?? '—'}</p>
        </div>

        {/* Country selector card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 ring-1 ring-black/[0.03]">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            访问国家（可选）
          </p>
          <CountrySelect
            countries={availableCountries}
            value={filterCountry}
            onChange={handleCountryChange}
          />
          <p className="text-xs text-gray-500 mt-2">
            当前：{filterCountry ? countryDisplay(filterCountry) : '全部国家'}
          </p>
        </div>

        {/* Device share card — mobile vs desktop with dual-colour progress bar */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 ring-1 ring-black/[0.03]">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">设备占比</p>
          {mobileRatio !== null && desktopRatio !== null ? (
            <>
              <div className="flex items-start justify-between gap-4 mb-3">
                {/* Mobile */}
                <div>
                  <p className="text-2xl font-bold text-blue-600 leading-none">{mobileRatio}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    📱 手机
                    {stats && <span className="ml-1 font-medium text-gray-700">{stats.mobileCount}</span>}
                  </p>
                </div>
                {/* Desktop */}
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-600 leading-none">{desktopRatio}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    🖥️ 桌面
                    {stats && <span className="ml-1 font-medium text-gray-700">{stats.desktopCount}</span>}
                  </p>
                </div>
              </div>
              {/* Full-width dual-colour progress bar */}
              <div className="h-2 rounded-full overflow-hidden flex w-full">
                <div className="bg-blue-500" style={{ width: `${mobileRatio}%` }} />
                <div className="bg-green-500" style={{ width: `${desktopRatio}%` }} />
              </div>
            </>
          ) : (
            <p className="text-3xl font-bold text-gray-400 leading-none">—</p>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 ring-1 ring-black/[0.03] flex items-center gap-3 flex-wrap">
        <ShortLinkSelect
          options={shortLinks}
          value={filterSlug}
          onChange={handleFilterChange}
        />
        <CountrySelect
          countries={availableCountries}
          value={filterCountry}
          onChange={handleCountryChange}
        />
        {(filterSlug || filterCountry) && (
          <button
            type="button"
            onClick={() => { handleFilterChange(''); handleCountryChange('') }}
            className="px-4 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            重置
          </button>
        )}
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 ring-1 ring-black/[0.03] overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-700 bg-gray-50/70 border-b border-gray-100">
                  {['访问时间','短链','国家','城市','IP 地址','设备','来源'].map((h) => (
                    <th key={h} className="py-4 px-5 font-bold text-sm text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="py-4 px-5">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${50 + (j * 13) % 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-gray-400 text-sm">暂无访问记录</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-700 bg-gray-50/70 border-b border-gray-100">
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">访问时间</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">短链</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">国家</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">城市</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">IP 地址</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">设备</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">操作系统</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">网络服务商</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">浏览器</th>
                  <th className="py-4 px-5 font-bold text-sm text-gray-700">来源</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-4 px-5 text-gray-800 whitespace-nowrap text-xs font-medium">
                      {formatDate(log.clicked_at)}
                    </td>
                    <td className="py-4 px-5">
                      {log.short_links ? (
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded-lg text-gray-700">
                          {log.short_links.slug}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                      {log.short_links?.title && (
                        <span className="ml-2 text-gray-500 text-xs">{log.short_links.title}</span>
                      )}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap text-xs text-gray-800 font-medium">
                      {log.country ? countryDisplay(log.country) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap text-xs text-gray-800 font-medium">
                      {log.city || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-4 px-5 text-gray-800 font-normal text-xs whitespace-nowrap">
                      {log.ip_address || '-'}
                    </td>
                    <td className="py-4 px-5">
                      <DeviceBadge device={log.device_type ?? null} />
                    </td>
                    <td className="py-4 px-5">
                      <OsBadge os={log.os ?? null} />
                    </td>
                    <td className="py-4 px-5 text-xs text-gray-800 font-medium whitespace-nowrap">
                      {log.isp || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-4 px-5">
                      <BrowserBadge browser={log.browser ?? null} />
                    </td>
                    <td className="py-4 px-5">
                      <SourceBadge referer={log.referer ?? null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-3 border-t border-gray-100">
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
