'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface WhatsAppNumber {
  id: string
  phone_number: string
  label: string | null
  platform: string
  is_active: boolean
  is_hidden: boolean
  click_count: number
}

interface ShortLinkWithNumbers {
  id: string
  slug: string
  title: string | null
  total_clicks: number
  is_active: boolean
  created_at: string
  whatsapp_numbers: WhatsAppNumber[]
}

interface AgentProfile {
  id: string
  email: string | null
  status: string
}

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WA',
  telegram: 'TG',
  line: 'LINE',
  custom: '自定义',
}

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: 'bg-green-100 text-green-700',
  telegram: 'bg-blue-100 text-blue-700',
  line: 'bg-emerald-100 text-emerald-700',
  custom: 'bg-purple-100 text-purple-700',
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [agent, setAgent] = useState<AgentProfile | null>(null)
  const [links, setLinks] = useState<ShortLinkWithNumbers[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Expanded link for adding hidden numbers
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newPlatform, setNewPlatform] = useState('whatsapp')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch agent profile via admin agents list and filter
    const agentsRes = await fetch('/api/admin/agents')
    if (agentsRes.status === 403) {
      router.push('/dashboard')
      return
    }

    if (agentsRes.ok) {
      const agentsList = await agentsRes.json()
      const found = agentsList.find((a: AgentProfile) => a.id === id)
      if (found) setAgent(found)
    }

    // Fetch agent's links
    const linksRes = await fetch(`/api/admin/agents/${id}/links`)
    if (linksRes.ok) {
      const data = await linksRes.json()
      setLinks(data)
    } else {
      const data = await linksRes.json()
      setError(data.error || '加载短链失败')
    }

    setLoading(false)
  }, [id, router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleAddHiddenNumber(linkId: string, e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const res = await fetch(`/api/admin/agents/${id}/links/${linkId}/numbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: newPhone,
        label: newLabel || null,
        platform: newPlatform,
      }),
    })

    const data = await res.json()
    if (res.ok) {
      setSuccess('隐藏号码添加成功')
      setNewPhone('')
      setNewLabel('')
      setNewPlatform('whatsapp')
      setAddingFor(null)
      fetchData()
    } else {
      setError(data.error || '添加失败')
    }
    setSaving(false)
  }

  async function handleDeleteNumber(linkId: string, numberId: string) {
    if (!confirm('确定要删除这个号码吗？')) return

    const res = await fetch(
      `/api/admin/agents/${id}/links/${linkId}/numbers?numberId=${numberId}`,
      { method: 'DELETE' }
    )

    if (res.ok) {
      setSuccess('号码已删除')
      fetchData()
    } else {
      const data = await res.json()
      setError(data.error || '删除失败')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/agents"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← 返回代理管理
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">管理代理短链</h1>
        {agent && (
          <p className="text-sm text-gray-500 mt-1">
            代理账号：<span className="font-medium text-gray-700">{agent.email}</span>
            <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              agent.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {agent.status === 'active' ? '正常' : '已禁用'}
            </span>
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-600">
          {success}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-400">加载中...</div>
      ) : links.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          该代理暂无短链
        </div>
      ) : (
        <div className="space-y-4">
          {links.map((link) => (
            <div key={link.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Link header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() =>
                  setExpandedLinkId(expandedLinkId === link.id ? null : link.id)
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${link.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">
                        {link.title || link.slug}
                      </span>
                      <code className="text-xs text-gray-500 font-mono">/{link.slug}</code>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {link.whatsapp_numbers.length} 个号码 · {link.total_clicks} 次点击
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setAddingFor(addingFor === link.id ? null : link.id)
                      setExpandedLinkId(link.id)
                      setNewPhone('')
                      setNewLabel('')
                      setNewPlatform('whatsapp')
                    }}
                    className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors font-medium"
                  >
                    + 注入隐藏号码
                  </button>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expandedLinkId === link.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded content */}
              {expandedLinkId === link.id && (
                <div className="border-t border-gray-100 px-5 pb-5">
                  {/* Add hidden number form */}
                  {addingFor === link.id && (
                    <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-xs font-semibold text-orange-700 mb-3">
                        🔒 注入隐藏号码（代理不可见）
                      </p>
                      <form
                        onSubmit={(e) => handleAddHiddenNumber(link.id, e)}
                        className="flex flex-wrap gap-2"
                      >
                        <select
                          value={newPlatform}
                          onChange={(e) => setNewPlatform(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                        >
                          <option value="whatsapp">WhatsApp</option>
                          <option value="telegram">Telegram</option>
                          <option value="line">LINE</option>
                          <option value="custom">自定义 URL</option>
                        </select>
                        <input
                          type="text"
                          placeholder="号码 / ID / URL"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          required
                          className="flex-1 min-w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <input
                          type="text"
                          placeholder="备注（可选）"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          className="flex-1 min-w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <button
                          type="submit"
                          disabled={saving}
                          className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
                        >
                          {saving ? '添加中...' : '确认注入'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingFor(null)}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          取消
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Numbers list */}
                  {link.whatsapp_numbers.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-400">暂无号码</p>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">号码列表</p>
                      {link.whatsapp_numbers.map((num) => (
                        <div
                          key={num.id}
                          className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${
                            num.is_hidden
                              ? 'bg-orange-50 border-orange-200'
                              : 'bg-gray-50 border-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              PLATFORM_COLORS[num.platform] || 'bg-gray-100 text-gray-600'
                            }`}>
                              {PLATFORM_LABELS[num.platform] || num.platform}
                            </span>
                            <span className="text-sm font-mono text-gray-700 truncate">
                              {num.phone_number}
                            </span>
                            {num.label && (
                              <span className="text-xs text-gray-400">{num.label}</span>
                            )}
                            {num.is_hidden && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                                🔒 隐藏
                              </span>
                            )}
                            {!num.is_active && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                已停用
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs text-gray-400">{num.click_count} 次</span>
                            <button
                              onClick={() => handleDeleteNumber(link.id, num.id)}
                              className="text-xs text-red-500 hover:text-red-600 hover:underline"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
