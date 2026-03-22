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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    setError('')

    if (captchaInput.trim() === '' || parseInt(captchaInput, 10) !== captcha.answer) {
      setError('验证码错误，请重新计算')
      refreshCaptcha()
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('邮箱或密码错误，请重试')
      refreshCaptcha()
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
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

      {/* Login card */}
      <div className="relative z-10 bg-white rounded-lg shadow-2xl p-8 w-full max-w-sm mx-4">
        {/* Title */}
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-gray-800 tracking-wide">分流后台管理</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-5 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email field */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="请输入邮箱"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-2.5 rounded font-semibold transition-colors text-sm tracking-wider"
          >
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>
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
