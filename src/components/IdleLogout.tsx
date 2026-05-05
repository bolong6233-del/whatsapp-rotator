'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'

const IDLE_MS = 60 * 60 * 1000 // 1 hour
const THROTTLE_MS = 500 // throttle activity events to reduce timer churn

export default function IdleLogout() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let lastReset = 0

    const logout = async () => {
      await supabase.auth.signOut().catch(() => {})
      // Hard redirect ensures navigation even if React tree is in a bad state
      window.location.href = '/login?timeout=1'
    }

    const reset = () => {
      const now = Date.now()
      if (now - lastReset < THROTTLE_MS) return
      lastReset = now
      clearTimeout(timer)
      timer = setTimeout(logout, IDLE_MS)
    }

    const events = ['click', 'keydown', 'mousemove', 'touchstart'] as const
    events.forEach((evt) => window.addEventListener(evt, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer)
      events.forEach((evt) => window.removeEventListener(evt, reset))
    }
  }, [])

  return null
}
