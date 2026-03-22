import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    // Return a default guest profile if not found (safe default — avoids granting unverified agent access)
    return NextResponse.json({ id: user.id, email: user.email, role: 'guest', status: 'active' })
  }

  return NextResponse.json(profile)
}
