import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  const { data: link } = await supabase
    .from('short_links')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!link) {
    return NextResponse.json({ error: '未找到' }, { status: 404 })
  }

  // Check if current user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  // Fetch numbers visible to this user; explicitly exclude hidden numbers for non-admins
  let numbersQuery = supabase
    .from('whatsapp_numbers')
    .select('*')
    .eq('short_link_id', id)
    .order('click_count', { ascending: false })

  if (!isAdmin) {
    numbersQuery = numbersQuery.eq('is_hidden', false)
  }

  const { data: numbers } = await numbersQuery

  // Fetch all click logs
  const { data: allLogs } = await supabase
    .from('click_logs')
    .select('*, whatsapp_numbers(phone_number, label)')
    .eq('short_link_id', id)
    .order('clicked_at', { ascending: false })
    .limit(100)

  let logs = allLogs || []

  // For agents: filter out click logs that reference hidden numbers
  if (!isAdmin) {
    // Use admin client to find hidden number IDs for this link
    const adminSupabase = createAdminClient()
    const { data: hiddenNumbers } = await adminSupabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('short_link_id', id)
      .eq('is_hidden', true)

    if (hiddenNumbers && hiddenNumbers.length > 0) {
      const hiddenIds = new Set(hiddenNumbers.map((n) => n.id))
      logs = logs.filter((log) => !hiddenIds.has(log.whatsapp_number_id))
    }
  }

  // For agents, total_clicks reflects only their visible numbers' click counts
  const visibleClickCount = isAdmin
    ? link.total_clicks
    : (numbers || []).reduce((sum: number, n: { click_count: number }) => sum + (n.click_count || 0), 0)

  return NextResponse.json({
    link,
    numbers: numbers || [],
    logs,
    total_clicks: visibleClickCount,
  })
}
