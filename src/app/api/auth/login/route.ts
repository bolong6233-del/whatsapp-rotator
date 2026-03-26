export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET ?? 'replace-me-with-a-strong-secret'

if (!process.env.CAPTCHA_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[auth/login] CAPTCHA_SECRET environment variable is not set. Please configure it before deploying.')
}

function verifyCaptcha(input: string, token: string): { ok: boolean; reason?: string } {
  if (!input || !token) return { ok: false, reason: '验证码缺失' }
  const dotIndex = token.lastIndexOf('.')
  if (dotIndex === -1) return { ok: false, reason: '验证码格式错误' }
  const sig = token.slice(0, dotIndex)
  const expStr = token.slice(dotIndex + 1)
  const exp = Number(expStr)
  if (!sig || !exp || isNaN(exp)) return { ok: false, reason: '验证码格式错误' }
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: '验证码已过期，请刷新' }

  const hmac = crypto.createHmac('sha256', CAPTCHA_SECRET)
  hmac.update(`${input.toLowerCase()}:${exp}`)
  const expected = hmac.digest('base64url')
  if (expected !== sig) return { ok: false, reason: '验证码不正确' }
  return { ok: true }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '请求格式错误' }, { status: 400 })

  const { emailOrUsername, password, captchaCode, captchaToken } = body as {
    emailOrUsername?: string
    password?: string
    captchaCode?: string
    captchaToken?: string
  }

  if (!emailOrUsername || !password) {
    return NextResponse.json({ error: '用户名/邮箱和密码不能为空' }, { status: 400 })
  }

  // Verify captcha
  const captchaResult = verifyCaptcha((captchaCode ?? '').trim().toLowerCase(), captchaToken ?? '')
  if (!captchaResult.ok) {
    return NextResponse.json({ error: captchaResult.reason }, { status: 400 })
  }

  // Resolve email: append @user.local if no @ present
  const email = emailOrUsername.includes('@') ? emailOrUsername : `${emailOrUsername}@user.local`

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: '服务器配置错误' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    return NextResponse.json({ error: '用户名/邮箱或密码错误，请重试' }, { status: 401 })
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
}
