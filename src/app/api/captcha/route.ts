export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import svgCaptcha from 'svg-captcha'
import crypto from 'crypto'

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET ?? 'replace-me-with-a-strong-secret'

if (!process.env.CAPTCHA_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[captcha] CAPTCHA_SECRET environment variable is not set. Please configure it before deploying.')
}
const EXPIRES_SECONDS = 60

function sign(code: string, exp: number): string {
  const hmac = crypto.createHmac('sha256', CAPTCHA_SECRET)
  hmac.update(`${code}:${exp}`)
  return hmac.digest('base64url')
}

export async function GET() {
  const captcha = svgCaptcha.create({
    size: 5,
    noise: 2,
    color: true,
    background: '#f7f7f7',
    width: 120,
    height: 44,
    ignoreChars: '0oO1iIl',
  })

  const expiresAt = Math.floor(Date.now() / 1000) + EXPIRES_SECONDS
  const token = `${sign(captcha.text.toLowerCase(), expiresAt)}.${expiresAt}`

  return NextResponse.json({
    svg: captcha.data,
    token,
    expiresIn: EXPIRES_SECONDS,
  })
}
