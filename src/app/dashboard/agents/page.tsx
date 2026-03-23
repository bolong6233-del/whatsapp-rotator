'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase-client'

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

interface AgentWithStats {
  id: string
  email: string | null
  role: string
  status: string
  created_at: string
  expires_at: string | null
  link_count: number
  total_clicks: number
  plain_password?: string
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

export default function AgentsPage() {
  const router = useRouter()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
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

  const isRoot = currentEmail === ROOT_ADMIN_EMAIL
  // Role options available when creating or editing (non-root cannot assign admin)
  const roleOptions = isRoot ? allRoleOptions : allRoleOptions.filter((o) => o.value !== 'admin')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id)
        setCurrentEmail(user.email ?? null)
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

    const res = await fetch('/api/admin/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
    })
    const data = await res.json()

    if (res.ok) {
      setSuccess('账号创建成功')
      setNewEmail('')
      setNewPassword('')
      setNewRole('agent')
      setShowCreate(false)
      mutate()
    } else {
      setError(data.error || '创建失败')
    }
    setCreating(false)
  }

  async function handleToggleStatus(agent: AgentWithStats) {
    const newStatus = agent.status === 'active' ? 'disabled' : 'active'
    const label = newStatus === 'disabled' ? '禁用' : '启用'
    if (!confirm(`确定要${label}账号 ${agent.email} 吗？`)) return

    const res = await fetch(`/api/admin/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (res.ok) {
      setSuccess(`账号已${label}`)
      mutate()
    } else {
      const data = await res.json()
      setError(data.error || '操作失败')
    }
  }

  async function handleChangeRole(agent: AgentWithStats, role: string) {
    const res = await fetch(`/api/admin/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })

    if (res.ok) {
      setSuccess('角色已更新')
      mutate()
    } else {
      const data = await res.json()
      setError(data.error || '操作失败')
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

    const res = await fetch(`/api/admin/agents/${pwAgent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPw }),
    })

    if (res.ok) {
      setSuccess('密码修改成功')
      setPwAgent(null)
      setNewPw('')
    } else {
      const data = await res.json()
      setError(data.error || '修改失败')
    }
    setSavingPw(false)
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

    const res = await fetch('/api/admin/agents/extend-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: extendAgent.id, period: extendPeriod }),
    })

    if (res.ok) {
      const data = await res.json()
      const label = timeOptions.find((o) => o.value === extendPeriod)?.label ?? extendPeriod
      setSuccess(`已为 ${extendAgent.email} 增加 ${label}，到期时间：${formatExpiry(data.expires_at)}`)
      setExtendAgent(null)
      mutate()
    } else {
      const data = await res.json()
      setError(data.error || '操作失败')
    }
    setExtending(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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
              type="email"
              placeholder="邮箱地址"
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
          <div className="p-8 text-center text-gray-400">加载中...</div>
        ) : agents.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无账号</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">邮箱</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">密码</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">角色</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">注册时间</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">到期时间</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">短链数</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">总点击</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const isSelf = agent.id === currentUserId
                const now = new Date()
                const isExpired = agent.expires_at ? new Date(agent.expires_at) < now : false
                return (
                  <tr key={agent.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900 font-medium">{agent.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{agent.plain_password || '未记录'}</td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(agent.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-right text-gray-700">{agent.link_count}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{agent.total_clicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        agent.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {agent.status === 'active' ? '正常' : '已禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/agents/${agent.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          管理短链
                        </Link>
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
    </div>
  )
}
