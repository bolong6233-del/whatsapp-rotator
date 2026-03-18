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

function buildRedirectUrl(phoneNumber: string, platform: string, autoReplyMessage?: string): string {
  const clean = phoneNumber.trim()
  switch (platform) {
    case 'telegram':
      return `https://t.me/${clean}`
    case 'line':
      return `https://line.me/ti/p/~${clean}`
    case 'custom': {
      // phone_number stores the full URL for custom platforms
      try {
        const parsed = new URL(clean)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          return parsed.toString()
        }
      } catch {
        // invalid URL
      }
      return '#'
    }
    case 'whatsapp':
    default: {
      const phone = clean.replace(/[^0-9]/g, '')
      if (autoReplyMessage) {
        return `https://wa.me/${phone}?text=${encodeURIComponent(autoReplyMessage)}`
      }
      return `https://wa.me/${phone}`
    }
  }
}

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

  const { data: rpcData, error: rpcError } = await supabase.rpc('increment_and_get_number', {
    p_slug: slug,
  })

  if (rpcError || !rpcData || rpcData.length === 0) {
    if (rpcError) {
      console.error('[slug] RPC increment_and_get_number failed:', rpcError.message)
    }
    return NextResponse.json({ error: 'Short link not found' }, { status: 404 })
  }

  const {
    phone_number,
    number_id,
    link_id,
    platform,
    auto_reply_enabled,
    auto_reply_messages,
    auto_reply_index,
  } = rpcData[0]

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

  // Determine auto-reply message (only for WhatsApp)
  let autoReplyMessage: string | undefined
  if (auto_reply_enabled && platform === 'whatsapp' && auto_reply_messages) {
    const messages = (auto_reply_messages as string)
      .split('\n')
      .map((m: string) => m.trim())
      .filter(Boolean)
    if (messages.length > 0) {
      autoReplyMessage = messages[(auto_reply_index as number) % messages.length]
    }
  }

  const redirectUrl = buildRedirectUrl(phone_number, platform || 'whatsapp', autoReplyMessage)

  if (redirectUrl === '#') {
    return NextResponse.json({ error: 'Invalid destination URL' }, { status: 500 })
  }

  // Always do a direct 302 redirect - no HTML pages
  return NextResponse.redirect(redirectUrl, { status: 302 })
}
