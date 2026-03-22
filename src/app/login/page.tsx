'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'

function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 10) + 1
  const num2 = Math.floor(Math.random() * 10) + 1
  const useAdd = Math.random() > 0.5
  if (useAdd) {
    return { num1, num2, operator: '+' as const, answer: num1 + num2 }
  } else {
    // Ensure non-negative result
    const a = Math.max(num1, num2)
    const b = Math.min(num1, num2)
    return { num1: a, num2: b, operator: '-' as const, answer: a - b }
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')

  // Login state
  const [loginInput, setLoginInput] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Register state
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)

  const [captcha, setCaptcha] = useState(() => generateCaptcha())
  const [captchaInput, setCaptchaInput] = useState('')

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha())
    setCaptchaInput('')
  }, [])

  useEffect(() => {
    refreshCaptcha()
  }, [refreshCaptcha])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')

    if (captchaInput.trim() === '' || parseInt(captchaInput, 10) !== captcha.answer) {
      setLoginError('验证码错误，请重新计算')
      refreshCaptcha()
      return
    }

    setLoginLoading(true)

    // If input has no "@", append "@user.local" automatically
    const emailToUse = loginInput.includes('@') ? loginInput : `${loginInput}@user.local`

    const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password: loginPassword })

    if (error) {
      setLoginError('用户名/邮箱或密码错误，请重试')
      refreshCaptcha()
      setLoginLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')

    if (captchaInput.trim() === '' || parseInt(captchaInput, 10) !== captcha.answer) {
      setRegError('验证码错误，请重新计算')
      refreshCaptcha()
      return
    }

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
      refreshCaptcha()
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
    setCaptchaInput('')
  }

  return (
    <div
      className="min-h-screen relative flex flex-col items-center justify-center"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=2850&q=80')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Card */}
      <div className="relative z-10 bg-white rounded-lg shadow-2xl p-8 w-full max-w-sm mx-4">
        {/* Title */}
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-gray-800 tracking-wide">分流后台管理</h1>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            登 录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'register'
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            注 册
          </button>
        </div>

        {/* ── LOGIN FORM ── */}
        {mode === 'login' && (
          <>
            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-5 text-sm">
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
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition text-sm bg-gray-50"
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
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition text-sm bg-gray-50"
                />
              </div>

              {/* Math Captcha */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-100 border border-gray-300 rounded px-4 py-2.5 text-center font-bold text-gray-800 text-base tracking-widest select-none">
                    {captcha.num1} {captcha.operator} {captcha.num2} = ?
                  </div>
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    title="换一题"
                    className="text-gray-400 hover:text-orange-500 transition-colors p-1"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <input
                  type="number"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  required
                  placeholder="请输入计算结果"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition text-sm bg-gray-50"
                />
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-orange-500 cursor-pointer"
                />
                <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">
                  记住密码
                </label>
              </div>

              {/* Login button */}
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-2.5 rounded font-semibold transition-colors text-sm tracking-wider"
              >
                {loginLoading ? '登录中...' : '登 录'}
              </button>
            </form>
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
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-5 text-sm">
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
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition text-sm bg-gray-50"
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
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition text-sm bg-gray-50"
                    />
                  </div>

                  {/* Math Captcha */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 border border-gray-300 rounded px-4 py-2.5 text-center font-bold text-gray-800 text-base tracking-widest select-none">
                        {captcha.num1} {captcha.operator} {captcha.num2} = ?
                      </div>
                      <button
                        type="button"
                        onClick={refreshCaptcha}
                        title="换一题"
                        className="text-gray-400 hover:text-orange-500 transition-colors p-1"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                    <input
                      type="number"
                      value={captchaInput}
                      onChange={(e) => setCaptchaInput(e.target.value)}
                      required
                      placeholder="请输入计算结果"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition text-sm bg-gray-50"
                    />
                  </div>

                  {/* Register button */}
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-2.5 rounded font-semibold transition-colors text-sm tracking-wider"
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
      <div className="absolute bottom-0 left-0 right-0 py-4 text-center z-10">
        <p className="text-white/70 text-xs">
          Copyright © 2024-2026 UPAPP All Rights Reserved.
        </p>
      </div>
    </div>
  )
}
