import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Navbar from '@/components/layout/Navbar'
import AlertBanner from '@/components/layout/AlertBanner'

const getProfile = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('role, status, expires_at')
    .eq('id', userId)
    .single()
  return data
})

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile to determine role and expiry (cached within the same render cycle)
  const profile = await getProfile(user.id)

  // Root admin email always gets highest privileges regardless of DB role value
  const ROOT_ADMIN_EMAIL = 'bolong6233@gmail.com'
  const role = user.email === ROOT_ADMIN_EMAIL ? 'root_admin' : (profile?.role ?? 'agent')
  const expiresAt = profile?.expires_at ?? null

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <AlertBanner role={role} expiresAt={expiresAt} email={user.email ?? null} />
        <Navbar user={user} />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
