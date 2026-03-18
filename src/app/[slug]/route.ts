import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Paths that must not be intercepted by the slug handler
const RESERVED_SLUGS = [
  'dashboard',  // authenticated app routes
  'login',      // auth pages
  'register',
  'api',        // API routes
  '_next',      // Next.js internals
  'favicon.ico',
  'fonts',
  'images',
  'icons',
  'public',
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (RESERVED_SLUGS.includes(slug)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  try {
    const { data, error } = await supabase.rpc('increment_and_get_number', {
      p_slug: slug,
    })

    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: 'Short link not found' }, { status: 404 })
    }

    const { phone_number, number_id, link_id } = data[0]

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null
    const referer = request.headers.get('referer') || null

    // Log the click asynchronously (don't await)
    supabase.from('click_logs').insert({
      short_link_id: link_id,
      whatsapp_number_id: number_id,
      ip_address: ip,
      user_agent: userAgent,
      referer: referer,
    }).then(({ error: logError }) => {
      if (logError) {
        console.error('[click_logs] Failed to insert click log:', logError.message)
      }
    })

    const waUrl = `https://wa.me/${phone_number.replace(/[^0-9]/g, '')}`
    return NextResponse.redirect(waUrl, { status: 302 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
