import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import LinkCard from '@/components/dashboard/LinkCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: links } = await supabase
    .from('short_links')
    .select('*, whatsapp_numbers(count)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  const totalClicks = links?.reduce((sum, link) => sum + (link.total_clicks || 0), 0) || 0

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">短链管理</h1>
          <p className="text-gray-500 mt-1">管理您的所有 WhatsApp 短链</p>
        </div>
        <Link
          href="/dashboard/create"
          className="bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>创建短链</span>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">短链总数</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{links?.length || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">总点击量</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{totalClicks}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">活跃短链</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">
            {links?.filter((l) => l.is_active).length || 0}
          </p>
        </div>
      </div>

      {/* Links List */}
      {!links || links.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <div className="text-5xl mb-4">🔗</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">还没有短链</h3>
          <p className="text-gray-500 mb-6">创建您的第一个 WhatsApp 短链开始使用</p>
          <Link
            href="/dashboard/create"
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium transition-colors inline-block"
          >
            创建第一个短链
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} formatDate={formatDate} />
          ))}
        </div>
      )}
    </div>
  )
}
