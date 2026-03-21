'use client'

/*
 * 访问记录 / IP Tracking page
 *
 * Required Supabase SQL (run once in Supabase SQL Editor):
 *
 *   -- Add city column if it doesn't exist
 *   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS city TEXT;
 *
 *   -- Full table definition for reference:
 *   -- CREATE TABLE click_logs (
 *   --   id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   --   short_link_id UUID NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
 *   --   whatsapp_number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
 *   --   ip_address  TEXT,
 *   --   country     TEXT,
 *   --   city        TEXT,
 *   --   user_agent  TEXT,
 *   --   referer     TEXT,
 *   --   clicked_at  TIMESTAMPTZ DEFAULT NOW()
 *   -- );
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import type { ClickLog } from '@/types'
import Pagination from '@/components/ui/Pagination'

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ClickLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filterSlug, setFilterSlug] = useState('')
  const [filterSlugInput, setFilterSlugInput] = useState('')

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
  }, [fetchLogs])

  const handleSearch = () => {
    setFilterSlug(filterSlugInput.trim())
    setPage(1)
  }

  const handleReset = () => {
    setFilterSlugInput('')
    setFilterSlug('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">访问记录</h1>
        <span className="text-sm text-gray-500">共 {totalCount} 条记录</span>
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
                  <th className="py-3 px-4 font-medium">IP 地址</th>
                  <th className="py-3 px-4 font-medium">国家/地区</th>
                  <th className="py-3 px-4 font-medium">城市</th>
                  <th className="py-3 px-4 font-medium">设备/浏览器</th>
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
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                      {log.ip_address || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {log.country || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {log.city || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs truncate max-w-xs">
                      {log.user_agent ? (
                        <span title={log.user_agent}>{log.user_agent}</span>
                      ) : '-'}
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
