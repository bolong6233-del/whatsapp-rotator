'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import Sidebar from '@/components/layout/Sidebar'
import Navbar from '@/components/layout/Navbar'
import AlertBanner from '@/components/layout/AlertBanner'
import TopProgressBar from '@/components/ui/TopProgressBar'
import ToastContainer from '@/components/ui/ToastContainer'
import { ProgressProvider } from '@/context/ProgressContext'
import { ToastProvider } from '@/context/ToastContext'
import type { User } from '@supabase/supabase-js'

const ROOT_ADMIN_EMAIL = process.env.NEXT_PUBLIC_ROOT_ADMIN_EMAIL!

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string>('agent')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        router.replace('/login')
        return
      }
      const u = session.user
      setUser(u)

      // Fetch profile for role/expiry (single request, client-side, cached by browser)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, expires_at')
        .eq('id', u.id)
        .single()

      const resolvedRole = u.email === ROOT_ADMIN_EMAIL
        ? 'root_admin'
        : (profile?.role ?? 'agent')
      setRole(resolvedRole)
      setExpiresAt(profile?.expires_at ?? null)
      setReady(true)
    })
  }, [router])
  // Listen for session loss (token refresh failure, sign out, etc.) and
  // show a friendly notice + redirect, so users don't see stale 401 errors
  // or silently broken pages.
    // Listen for session loss (token refresh failure, sign out, etc.) and
  // show a friendly notice + redirect, so users don't see stale 401 errors
  // or silently broken pages.
  useEffect(() => {
    const redirectToLogin = (withTimeout: boolean) => {
      if (window.location.pathname.startsWith('/login')) return
      // Hard redirect ensures navigation regardless of React state
      window.location.href = withTimeout ? '/login?timeout=1' : '/login'
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const isSignedOut =
        event === 'SIGNED_OUT' ||
        (event === 'TOKEN_REFRESHED' && !session) ||
        (event === 'USER_UPDATED' && !session)
      if (isSignedOut) redirectToLogin(true)
    })

    // Belt-and-suspenders: if the tab regains focus and the session is gone
    // (e.g. token expired in the background, refresh failed silently),
    // kick the user back to the login page.
    const onFocus = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) redirectToLogin(true)
    }
    window.addEventListener('focus', onFocus)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  // While checking auth, show nothing (avoids flash)
  if (!ready || !user) return null

  return (
    <ProgressProvider>
      <ToastProvider>
        <TopProgressBar />
        <ToastContainer />
        <div className="min-h-screen bg-gray-50 flex">
          <Sidebar role={role} />
          <div className="flex-1 flex flex-col min-w-0">
            <AlertBanner role={role} expiresAt={expiresAt} email={user.email ?? null} />
            <Navbar user={user} />
            <main className="flex-1 p-6">
              <div key={pathname} className="animate-slide-up-fade">
                {children}
              </div>
            </main>
          </div>
        </div>
      </ToastProvider>
    </ProgressProvider>
  )
}
