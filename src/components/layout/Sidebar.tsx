'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: '短链列表' },
  { href: '/dashboard/tickets', label: '工单管理' },
  { href: '/dashboard/numbers', label: '号码管理' },
  { href: '/dashboard/logs', label: '访问记录' },
  { href: '/dashboard/profile', label: '个人中心' },
]

const adminNavItems = [
  { href: '/dashboard/agents', label: '代理管理' },
]

export default function Sidebar({ role = 'agent', isAdmin }: { role?: string; isAdmin?: boolean }) {
  const pathname = usePathname()

  // Support legacy isAdmin prop and new role prop
  const canManageAgents = role === 'admin' || role === 'root' || role === 'root_admin' || isAdmin === true
  const allItems = canManageAgents ? [...navItems, ...adminNavItems] : navItems

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-5 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl">💬</span>
          <span className="font-bold text-gray-900">分流后台管理</span>
        </Link>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {allItems.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
