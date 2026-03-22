'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface AgentWithStats {
  id: string
  email: string | null
  role: string
  status: string
  created_at: string
  link_count: number
  total_clicks: number
}

export default function AgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<AgentWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create agent form state
  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)

  // Change password modal
  const [pwAgent, setPwAgent] = useState<AgentWithStats | null>(null)
  const [newPw, setNewPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/agents')
    if (res.status === 403) {
      router.push('/dashboard')
      return
    }
    const data = await res.json()
    if (res.ok) {
      setAgents(data)
    } else {
      setError(data.error || '加载失败')
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/admin/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword }),
    })
    const data = await res.json()

    if (res.ok) {
      setSuccess('代理账号创建成功')
      setNewEmail('')
      setNewPassword('')
      setShowCreate(false)
      fetchAgents()
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
      fetchAgents()
    } else {
      const data = await res.json()
      setError(data.error || '操作失败')
    }
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
          + 新建代理账号
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
          <h2 className="text-base font-semibold text-gray-900 mb-4">新建代理账号</h2>
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
          <div className="p-8 text-center text-gray-400">暂无代理账号</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">邮箱</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">注册时间</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">短链数</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">总点击</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900 font-medium">{agent.email || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(agent.created_at).toLocaleDateString('zh-CN')}
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
                        onClick={() => { setPwAgent(agent); setNewPw('') }}
                        className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                      >
                        改密码
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
              ))}
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
                  onClick={() => { setPwAgent(null); setNewPw('') }}
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
