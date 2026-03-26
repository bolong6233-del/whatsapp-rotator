'use client'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

const BG_URL =
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80'
const FORGOT_LINK = 'https://t.me/TKJZYL'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const isTimeout = searchParams.get('timeout') === '1'

  const [mode, setMode] = useState<'login' | 'register'>('login')

  // Login state
  const [loginInput, setLoginInput] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Captcha state
  const [captchaSvg, setCaptchaSvg] = useState<string>('')
  const [captchaToken, setCaptchaToken] = useState<string>('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [captchaTTL, setCaptchaTTL] = useState(60)
  const [captchaLoading, setCaptchaLoading] = useState(false)

  // Register state
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true)
    try {
      const res = await fetch('/api/captcha')
      const data = await res.json()
      setCaptchaSvg(data.svg ?? '')
      setCaptchaToken(data.token ?? '')
      setCaptchaTTL(data.expiresIn ?? 60)
      setCaptchaInput('')
    } catch {
      // ignore network errors silently; user can click to retry
    } finally {
      setCaptchaLoading(false)
    }
  }, [])

  // Fetch captcha on mount
  useEffect(() => {
    fetchCaptcha()
  }, [fetchCaptcha])

  // Countdown timer
  useEffect(() => {
    if (!captchaSvg) return
    const timer = setInterval(() => setCaptchaTTL((t) => Math.max(t - 1, 0)), 1000)
    return () => clearInterval(timer)
  }, [captchaSvg])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')

    if (captchaTTL === 0) {
      setLoginError('验证码已过期，请点击图片刷新')
      return
    }

    setLoginLoading(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrUsername: loginInput.trim(),
        password: loginPassword,
        captchaCode: captchaInput.trim(),
        captchaToken,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setLoginError(data.error || '登录失败，请稍后重试')
      setLoginLoading(false)
      // Refresh captcha on error
      fetchCaptcha()
      return
    }

    const { access_token, refresh_token } = await res.json()
    await supabase.auth.setSession({ access_token, refresh_token })
    window.location.href = '/dashboard'
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')

    if (regPassword.length < 6) {
      setRegError('密码长度不能少于 6 位')
      return
    }

    setRegLoading(true)

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: regUsername, password: regPassword }),
    })

    const data = await res.json()

    if (!res.ok) {
      setRegError(data.error || '注册失败，请稍后重试')
      setRegLoading(false)
    } else {
      setRegSuccess(true)
      // Auto sign in after registration
      const emailToUse = `${regUsername}@user.local`
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: emailToUse, password: regPassword })
      if (signInError) {
        // Auto sign-in failed; redirect to login page so user can sign in manually
        setTimeout(() => { window.location.href = '/login' }, 1500)
      } else {
        setTimeout(() => { window.location.href = '/dashboard' }, 1500)
      }
    }
  }

  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode)
    setLoginError('')
    setRegError('')
    setRegSuccess(false)
  }

  return (
    <div
      className="min-h-screen relative flex flex-col items-center justify-center"
      style={{ backgroundImage: `url('${BG_URL}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Card */}
      <div className="relative z-10 bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4">
        {/* Logo / Title */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-600 mb-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-wide">分流后台管理</h1>
          <p className="text-sm text-gray-500 mt-1">WhatsApp Rotator</p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            登 录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'register'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            注 册
          </button>
        </div>

        {/* ── LOGIN FORM ── */}
        {mode === 'login' && (
          <>
            {isTimeout && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg mb-5 text-sm">
                长时间未操作，会话已过期，请重新登录
              </div>
            )}

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-5 text-sm">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Username / Email field */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  required
                  placeholder="请输入用户名或邮箱"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm bg-gray-50"
                />
              </div>

              {/* Password field */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  placeholder="请输入密码"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm bg-gray-50"
                />
              </div>

              {/* Captcha field */}
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    required
                    placeholder="请输入验证码"
                    maxLength={6}
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={fetchCaptcha}
                    disabled={captchaLoading}
                    title={captchaTTL > 0 ? `剩余 ${captchaTTL}s，点击刷新` : '验证码已过期，点击刷新'}
                    className="flex-shrink-0 w-[120px] h-[44px] border border-gray-300 rounded-lg overflow-hidden bg-gray-50 hover:border-green-500 transition-colors cursor-pointer disabled:opacity-60"
                    dangerouslySetInnerHTML={{ __html: captchaSvg || '<span style="font-size:12px;color:#999;padding:4px">加载中...</span>' }}
                  />
                </div>
                {captchaTTL === 0 ? (
                  <p className="text-xs text-red-500 mt-1">验证码已过期，请点击图片刷新</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">点击图片可刷新验证码（{captchaTTL}s 后过期）</p>
                )}
              </div>

              {/* Login button */}
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm tracking-wider"
              >
                {loginLoading ? '登录中...' : '登 录'}
              </button>
            </form>

            {/* Forgot password */}
            <div className="mt-3 text-right">
              <a
                href={FORGOT_LINK}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-green-600 hover:text-green-700 hover:underline"
              >
                忘记密码？
              </a>
            </div>
          </>
        )}

        {/* ── REGISTER FORM ── */}
        {mode === 'register' && (
          <>
            {regSuccess ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-gray-700 font-semibold">注册成功！正在跳转...</p>
              </div>
            ) : (
              <>
                {regError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-5 text-sm">
                    {regError}
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Username field */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      required
                      placeholder="请输入用户名（字母、数字、下划线）"
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm bg-gray-50"
                    />
                  </div>

                  {/* Password field */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      placeholder="请输入密码（至少 6 位）"
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm bg-gray-50"
                    />
                  </div>

                  {/* Register button */}
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm tracking-wider"
                  >
                    {regLoading ? '注册中...' : '立即注册'}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 py-4 text-center mt-4">
        <p className="text-white/70 text-xs">
          Copyright © 2024-2026 UPAPP All Rights Reserved.
        </p>
      </div>
    </div>
  )
}

