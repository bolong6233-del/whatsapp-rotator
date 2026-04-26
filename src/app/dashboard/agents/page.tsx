'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'
import { useTopProgress } from '@/context/ProgressContext'
import { useToast } from '@/context/ToastContext'

const ROOT_ADMIN_EMAIL = process.env.NEXT_PUBLIC_ROOT_ADMIN_EMAIL!

interface AgentWithStats {
  id: string
  email: string | null
  role: string
  status: string
  created_at: string
  expires_at: string | null
  link_count: number
  total_clicks: number
  today_clicks: number
  plain_password?: string
  created_by_email?: string | null
  can_inject_numbers?: boolean
  notes?: string | null
  injected_count?: number
  last_sign_in_at?: string | null
  max_agents?: number | null
}

const allRoleOptions = [
  { value: 'agent', label: '高级代理' },
  { value: 'guest', label: '游客' },
  { value: 'admin', label: '管理员' },
]

const roleBadge: Record<string, string> = {
  root:  'bg-red-100 text-red-700',
  admin: 'bg-purple-100 text-purple-700',
  agent: 'bg-blue-100 text-blue-700',
  guest: 'bg-gray-100 text-gray-600',
}

const roleLabel: Record<string, string> = {
  root:  '超级管理员',
  admin: '管理员',
  agent: '高级代理',
  guest: '游客',
}

const timeOptions = [
  { value: '1d', label: '1天' },
  { value: '1m', label: '一个月' },
  { value: '3m', label: '三个月' },
  { value: '6m', label: '半年' },
  { value: '1y', label: '一年' },
]

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return '未分配'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '未分配'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date).replace(/\//g, '-')
}

function formatLastLogin(dateStr: string | null | undefined): string {
  if (!dateStr) return '从未'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '从未'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date).replace(/\//g, '-')
}

export default function AgentsPage() {
  const router = useRouter()
  const { start, done } = useTopProgress()
  const { showToast } = useToast()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [currentUserCanInject, setCurrentUserCanInject] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create agent form state
  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('agent')
  const [creating, setCreating] = useState(false)

  // Change password modal
  const [pwAgent, setPwAgent] = useState<AgentWithStats | null>(null)
  const [newPw, setNewPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  // Extend time modal
  const [extendAgent, setExtendAgent] = useState<AgentWithStats | null>(null)
  const [extendPeriod, setExtendPeriod] = useState('1m')
  const [extending, setExtending] = useState(false)

  // Delete account modal
  const [deleteAgent, setDeleteAgent] = useState<AgentWithStats | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Quota modal (root admin sets max_agents for an admin)
  const [quotaAgent, setQuotaAgent] = useState<AgentWithStats | null>(null)
  const [quotaValue, setQuotaValue] = useState<string>('')
  const [savingQuota, setSavingQuota] = useState(false)

  // Inline notes editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const isRoot = currentEmail === ROOT_ADMIN_EMAIL
  // Role options available when creating or editing (non-root cannot assign admin)
  const roleOptions = isRoot ? allRoleOptions : allRoleOptions.filter((o) => o.value !== 'admin')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id)
        setCurrentEmail(user.email ?? null)

        const { data: profile } = await supabase
          .from('profiles')
          .select('can_inject_numbers')
          .eq('id', user.id)
          .single()

        setCurrentUserCanInject(profile?.can_inject_numbers ?? false)
      }
    })
  }, [])

  const { data: agents = [], isLoading, mutate } = useSWR<AgentWithStats[]>(
    '/api/admin/agents',
    async (url: string) => {
      const res = await fetch(url)
      if (res.status === 403) {
        router.push('/dashboard')
        return []
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '加载失败')
      return data
    },
    {
      onError: (err: Error) => setError(err.message),
      revalidateOnFocus: true,
    }
  )

  const loading = isLoading

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSuccess('')
    start()

    // Auto-append @user.local if no @ symbol
    const emailToSend = newEmail.includes('@') ? newEmail : `${newEmail}@user.local`

    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToSend, password: newPassword, role: newRole }),
      })
      const data = await res.json()

      if (res.ok) {
        setSuccess('账号创建成功')
        showToast('账号创建成功', 'success')
        setNewEmail('')
        setNewPassword('')
        setNewRole('agent')
        setShowCreate(false)
        mutate()
      } else {
        setError(data.error || '创建失败')
        showToast(data.error || '创建失败', 'error')
      }
    } finally {
      setCreating(false)
      done()
    }
  }

  async function handleToggleStatus(agent: AgentWithStats) {
    const newStatus = agent.status === 'active' ? 'disabled' : 'active'
    const label = newStatus === 'disabled' ? '禁用' : '启用'
    if (!confirm(`确定要${label}账号 ${agent.email} 吗？`)) return

    start()
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (res.ok) {
        setSuccess(`账号已${label}`)
        showToast(`账号已${label}`, 'success')
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || '操作失败')
        showToast(data.error || '操作失败', 'error')
      }
    } finally {
      done()
    }
  }

  function handleOpenDeleteModal(agent: AgentWithStats) {
    setDeleteAgent(agent)
  }

  function handleCloseDeleteModal() {
    setDeleteAgent(null)
  }

  async function confirmDeleteAgent() {
    if (!deleteAgent) return
    setDeleting(true)
    setError('')
    start()

    try {
      const res = await fetch(`/api/admin/agents/${deleteAgent.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setSuccess(`账号 ${deleteAgent.email} 已永久删除`)
        showToast(`账号 ${deleteAgent.email} 已永久删除`, 'success')
        setDeleteAgent(null)
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || '删除失败')
        showToast(data.error || '删除失败', 'error')
      }
    } finally {
      setDeleting(false)
      done()
    }
  }
  async function handleToggleInjectPermission(agent: AgentWithStats) {
    const newValue = !agent.can_inject_numbers
    start()
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ can_inject_numbers: newValue }),
      })

      if (res.ok) {
        setSuccess('上帝之手权限已更新')
        showToast('上帝之手权限已更新', 'success')
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || '操作失败')
        showToast(data.error || '操作失败', 'error')
      }
    } finally {
      done()
    }
  }

  async function handleChangeRole(agent: AgentWithStats, role: string) {
    start()
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      if (res.ok) {
        setSuccess('角色已更新')
        showToast('角色已更新', 'success')
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || '操作失败')
        showToast(data.error || '操作失败', 'error')
      }
    } finally {
      done()
    }
  }

  function handleOpenPwModal(agent: AgentWithStats) {
    setPwAgent(agent)
    setNewPw('')
  }

  function handleClosePwModal() {
    setPwAgent(null)
    setNewPw('')
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!pwAgent) return
    setSavingPw(true)
    setError('')
    start()

    try {
      const res = await fetch(`/api/admin/agents/${pwAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      })

      if (res.ok) {
        setSuccess('密码修改成功')
        showToast('密码修改成功', 'success')
        setPwAgent(null)
        setNewPw('')
      } else {
        const data = await res.json()
        setError(data.error || '修改失败')
        showToast(data.error || '修改失败', 'error')
      }
    } finally {
      setSavingPw(false)
      done()
    }
  }

  function handleOpenExtendModal(agent: AgentWithStats) {
    setExtendAgent(agent)
    setExtendPeriod('1m')
  }

  function handleCloseExtendModal() {
    setExtendAgent(null)
  }

  async function handleExtendTime(e: React.FormEvent) {
    e.preventDefault()
    if (!extendAgent) return
    setExtending(true)
    setError('')
    start()

    try {
      const res = await fetch('/api/admin/agents/extend-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: extendAgent.id, period: extendPeriod }),
      })

      if (res.ok) {
        const data = await res.json()
        const label = timeOptions.find((o) => o.value === extendPeriod)?.label ?? extendPeriod
        const msg = `已为 ${extendAgent.email} 增加 ${label}，到期时间：${formatExpiry(data.expires_at)}`
        setSuccess(msg)
        showToast(msg, 'success')
        setExtendAgent(null)
        mutate()
      } else {
        const data = await res.json()
        setError(data.error || '操作失败')
        showToast(data.error || '操作失败', 'error')
      }
    } finally {
      setExtending(false)
      done()
    }
  }

  async function handleSaveNote(agentId: string) {
    setSavingNote(true)
    start()
    try {
      const res = await fetch(`/api/admin/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: noteValue.trim() || null }),
      })
      if (res.ok) {
        showToast('备注已保存', 'success')
        mutate()
        setEditingNoteId(null)
      } else {
        const data = await res.json()
        setError(data.error || '保存备注失败')
        showToast(data.error || '保存备注失败', 'error')
      }
    } finally {
      setSavingNote(false)
      done()
    }
  }

  async function handleSaveQuota(e: React.FormEvent) {
    e.preventDefault()
    if (!quotaAgent) return
    setSavingQuota(true)
    try {
      const trimmed = quotaValue.trim()
      const max = trimmed === '' ? null : parseInt(trimmed, 10)
      if (trimmed !== '' && (isNaN(max as number) || (max as number) < 0)) {
        showToast('请输入有效的配额数量', 'error')
        return
      }
      const res = await fetch(`/api/admin/agents/${quotaAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_agents: max }),
      })
      if (res.ok) {
        showToast('配额已更新', 'success')
        setQuotaAgent(null)
        mutate()
      } else {
        const data = await res.json()
        showToast(data.error || '保存失败', 'error')
      }
    } finally {
      setSavingQuota(false)
    }
  }

  return (
    <div className="max-w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">代理管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理子账号及其权限</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          + 新建账号
        </button>
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

      {/* Create Agent Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">新建账号</h2>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="邮箱地址（不含@则自动补@user.local）"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="password"
              placeholder="初始密码"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating}
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {creating ? '创建中...' : '创建'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          </form>
        </div>
      )}

      {/* Agents Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['邮箱', '密码', '角色', '备注', '注册时间', '到期时间', '最后登录', '短链数', '总点击', '今日点击', ...(isRoot || currentUserCanInject ? ['注入'] : []), '状态', '操作'].map((h) => (
                  <th key={h} className="text-left px-5 py-4 text-sm font-bold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: (isRoot || currentUserCanInject) ? 13 : 12 }).map((__, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${50 + (j * 17) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : agents.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无账号</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">邮箱</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">密码</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">角色</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">备注</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">注册时间</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">到期时间</th>
                <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">最后登录</th>
                <th className="text-right px-5 py-4 text-sm font-bold text-gray-700">短链数</th>
                <th className="text-right px-5 py-4 text-sm font-bold text-gray-700">总点击</th>
                <th className="text-right px-5 py-4 text-sm font-bold text-gray-700">今日点击</th>
                {(isRoot || currentUserCanInject) && (
                  <th className="text-center px-5 py-4 text-sm font-bold text-gray-700">注入</th>
                )}
                <th className="text-center px-5 py-4 text-sm font-bold text-gray-700">状态</th>
                {isRoot && (
                  <th className="text-left px-5 py-4 text-sm font-bold text-gray-700">创建者</th>
                )}
                <th className="text-right px-5 py-4 text-sm font-bold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const isSelf = agent.id === currentUserId
                const now = new Date()
                const MS_PER_DAY = 1000 * 60 * 60 * 24
                const isExpired = agent.expires_at ? new Date(agent.expires_at) < now : false
                const daysExpired = isExpired && agent.expires_at
                  ? Math.floor((now.getTime() - new Date(agent.expires_at).getTime()) / MS_PER_DAY)
                  : 0
                const isEditingNote = editingNoteId === agent.id
                return (
                  <tr key={agent.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 text-gray-900 font-medium">{agent.email || '-'}</td>
                    <td className="px-5 py-4 text-gray-700 font-mono text-sm">{agent.plain_password || '未记录'}</td>
                    <td className="px-5 py-4">
                      {agent.role === 'root' || isSelf ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadge[agent.role] ?? roleBadge.agent}`}>
                          {roleLabel[agent.role] ?? agent.role}
                        </span>
                      ) : (
                        <select
                          value={agent.role}
                          onChange={(e) => handleChangeRole(agent, e.target.value)}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${roleBadge[agent.role] ?? roleBadge.agent}`}
                        >
                          {roleOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-4 max-w-[140px]">
                      {isEditingNote ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={noteValue}
                            onChange={(e) => setNoteValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveNote(agent.id)
                              if (e.key === 'Escape') setEditingNoteId(null)
                            }}
                            autoFocus
                            className="w-full px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button
                            onClick={() => handleSaveNote(agent.id)}
                            disabled={savingNote}
                            className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingNoteId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingNoteId(agent.id)
                            setNoteValue(agent.notes ?? '')
                          }}
                          className="text-xs text-left w-full group"
                          title="点击编辑备注"
                        >
                          {agent.notes ? (
                            <span className="text-gray-700 group-hover:text-blue-600">{agent.notes}</span>
                          ) : (
                            <span className="text-gray-300 group-hover:text-blue-400">+ 备注</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {new Date(agent.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-5 py-4">
                      {agent.expires_at ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          isExpired ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {formatExpiry(agent.expires_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">未分配</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600 text-xs whitespace-nowrap">
                      {formatLastLogin(agent.last_sign_in_at)}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-700">{agent.link_count}</td>
                    <td className="px-5 py-4 text-right text-gray-700">{agent.total_clicks.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right text-gray-700">{(agent.today_clicks ?? 0).toLocaleString()}</td>
                    {(isRoot || currentUserCanInject) && (
                    <td className="px-5 py-4 text-center">
                      {(agent.injected_count ?? 0) > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          已注入 {agent.injected_count}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">无注入</span>
                      )}
                    </td>
                    )}
                    <td className="px-5 py-4 text-center">
                      {agent.status === 'disabled' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          已禁用
                        </span>
                      ) : !agent.expires_at ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          未使用
                        </span>
                      ) : isExpired ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          已到期 {daysExpired}天
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          正常
                        </span>
                      )}
                    </td>
                    {isRoot && (
                      <td className="px-5 py-4 text-gray-700 text-sm">
                        {agent.created_by_email || '-'}
                      </td>
                    )}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {(isRoot || currentUserCanInject) && (
                          <Link
                            href={`/dashboard/agents/${agent.id}`}
                            className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            管理短链
                          </Link>
                        )}
                        <button
                          onClick={() => handleOpenPwModal(agent)}
                          className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                        >
                          改密码
                        </button>
                        <button
                          onClick={() => handleOpenExtendModal(agent)}
                          className="text-xs text-orange-500 hover:text-orange-600 hover:underline"
                        >
                          加时
                        </button>
                        <button
                          onClick={() => handleToggleStatus(agent)}
                          className={`text-xs hover:underline ${
                            agent.status === 'active'
                              ? 'text-red-500 hover:text-red-600'
                              : 'text-green-600 hover:text-green-700'
                          }`}
                        >
                          {agent.status === 'active' ? '禁用' : '启用'}
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => handleOpenDeleteModal(agent)}
                            className="text-xs text-red-700 hover:text-red-900 hover:underline font-medium"
                          >
                            删除账号
                          </button>
                        )}
                        {isRoot && !isSelf && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-xs text-orange-600 whitespace-nowrap">🔱上帝之手</span>
                            <button
                              type="button"
                              onClick={() => handleToggleInjectPermission(agent)}
                              aria-label="切换上帝之手权限"
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${agent.can_inject_numbers ? 'bg-blue-500' : 'bg-gray-300'}`}
                            >
                              <span aria-hidden="true" className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${agent.can_inject_numbers ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </span>
                        )}
                        {isRoot && !isSelf && agent.role === 'admin' && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-xs text-purple-600 whitespace-nowrap">
                              {agent.max_agents !== null && agent.max_agents !== undefined
                                ? `配额 ${agent.max_agents}`
                                : '配额 无限'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setQuotaAgent(agent)
                                setQuotaValue(agent.max_agents !== null && agent.max_agents !== undefined ? String(agent.max_agents) : '')
                              }}
                              className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
                            >
                              设配额
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Change Password Modal */}
      {pwAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">修改密码</h3>
            <p className="text-sm text-gray-500 mb-4">{pwAgent.email}</p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <input
                type="password"
                placeholder="新密码（至少6位）"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={savingPw}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {savingPw ? '保存中...' : '确认修改'}
                </button>
                <button
                  type="button"
                  onClick={handleClosePwModal}
                  className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extend Time Modal */}
      {extendAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">增加使用时间</h3>
            <p className="text-sm text-gray-500 mb-1">{extendAgent.email}</p>
            <p className="text-xs text-gray-400 mb-4">
              当前到期时间：{extendAgent.expires_at ? formatExpiry(extendAgent.expires_at) : '未分配'}
            </p>
            <form onSubmit={handleExtendTime} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {timeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExtendPeriod(opt.value)}
                    className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                      extendPeriod === opt.value
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400 hover:text-orange-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={extending}
                  className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {extending ? '处理中...' : '确认加时'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseExtendModal}
                  className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {deleteAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">删除账号</h3>
            <p className="text-sm text-gray-500 mb-3">{deleteAgent.email}</p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-700">
                ⚠️ 此操作将永久删除该账号及其所有相关数据，<strong>无法撤销</strong>，且该账号将无法再登录系统。
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={confirmDeleteAgent}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? '删除中...' : '确认永久删除'}
              </button>
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={deleting}
                className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quota Modal */}
      {quotaAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">设置代理配额</h3>
            <p className="text-sm text-gray-500 mb-4">{quotaAgent.email}</p>
            <form onSubmit={handleSaveQuota} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  最大代理数量
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="留空表示无限制"
                  value={quotaValue}
                  onChange={(e) => setQuotaValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-400 mt-1">输入一个正整数限制最大代理数量，留空表示无限制。填写 0 表示禁止该管理员创建代理。</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={savingQuota}
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {savingQuota ? '保存中...' : '保存配额'}
                </button>
                <button
                  type="button"
                  onClick={() => setQuotaAgent(null)}
                  className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
