'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

export default function Navbar({ user }: { user: User }) {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between">
      <div className="text-sm text-gray-500">控制台</div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{user.email}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          退出
        </button>
      </div>
    </header>
  )
}
