'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { getBaseUrl, copyToClipboard, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface LinkCardProps {
  link: {
    id: string
    slug: string
    title: string | null
    is_active: boolean
    total_clicks: number
    created_at: string
    auto_reply_enabled?: boolean
    auto_reply_messages?: string | null
    whatsapp_numbers?: { count: number }[]
  }
}

export default function LinkCard({ link }: LinkCardProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const shortUrl = `${getBaseUrl()}/${link.slug}`
  const numberCount = link.whatsapp_numbers?.[0]?.count || 0

  const handleCopy = async () => {
    const ok = await copyToClipboard(shortUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定要删除此短链吗？')) return
    await supabase.from('short_links').delete().eq('id', link.id)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${link.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
            <h3 className="font-semibold text-gray-900 truncate">
              {link.title || link.slug}
            </h3>
          </div>
          <p className="text-sm text-gray-500 font-mono truncate">{shortUrl}</p>
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span>📊 {link.total_clicks} 次点击</span>
            <span>📱 {numberCount} 个号码</span>
            <span>💬 {link.auto_reply_enabled
              ? `${link.auto_reply_messages?.split('\n').filter(Boolean).length ?? 0} 条回复语`
              : '自动回复关闭'
            }</span>
            <span>🕐 {formatDate(link.created_at)}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
          >
            {copied ? '已复制 ✓' : '复制链接'}
          </button>
          <Link
            href={`/dashboard/${link.id}`}
            className="px-3 py-1.5 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors"
          >
            管理
          </Link>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
