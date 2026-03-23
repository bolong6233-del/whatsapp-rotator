'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import Sidebar from '@/components/layout/Sidebar'
import Navbar from '@/components/layout/Navbar'
import AlertBanner from '@/components/layout/AlertBanner'
import type { User } from '@supabase/supabase-js'

const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'

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

  // While checking auth, show nothing (avoids flash)
  if (!ready || !user) return null

  return (
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
  )
}
