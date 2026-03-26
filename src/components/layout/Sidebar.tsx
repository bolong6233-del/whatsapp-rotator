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
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-700/60">
        <Link href="/dashboard" className="flex items-center gap-2">
          <svg className="w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 L5 18 L12 15 L19 18 Z" />
            <path d="M12 3 L12 15" />
            <path d="M3 21 L21 21" />
          </svg>
          <span className="text-base font-bold text-white tracking-wide">拓客分流后台</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {allItems.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium tracking-wide transition-all duration-150 active:scale-95 ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border-l-4 border-blue-500 pl-2'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200 border-l-4 border-transparent pl-2'
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