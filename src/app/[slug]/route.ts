import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Fallback: redirect to WhatsApp with empty phone (shows friendly error page)
const WHATSAPP_FALLBACK = 'https://api.whatsapp.com/send/?phone='

// Paths that must not be intercepted by the slug handler
const RESERVED_SLUGS = [
  'dashboard',
  'login',
  'register',
  'api',
  '_next',
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
      try {
        const parsed = new URL(clean)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          return parsed.toString()
        }
      } catch {
        // invalid URL
      }
      return WHATSAPP_FALLBACK
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
  const { searchParams } = new URL(request.url)
  const isDebug = searchParams.get('debug') === '1'

  if (RESERVED_SLUGS.includes(slug)) {
    return NextResponse.redirect(WHATSAPP_FALLBACK, { status: 302 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: rpcData, error: rpcError } = await supabase.rpc('increment_and_get_number', {
    p_slug: slug,
  })

  const noData = !rpcData || rpcData.length === 0

  if (rpcError) {
    console.error(`[Slug Redirect] RPC Error for slug ${slug}:`, rpcError)
  } else if (noData) {
    console.warn(`[Slug Redirect] No active numbers or link found for slug: ${slug}`)
  }

  // No data found -> redirect to WhatsApp fallback (shows friendly "link incorrect" page)
  if (rpcError || noData) {
    if (isDebug) {
      return NextResponse.json({ error: 'Redirect failed', rpcError, rpcData, slug }, { status: 500 })
    }
    return NextResponse.redirect(WHATSAPP_FALLBACK, { status: 302 })
  }

  const {
    phone_number,
    number_id,
    link_id,
    platform,
    tiktok_pixel_enabled,
    tiktok_pixel_id,
    tiktok_access_token,
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

  // Fire TikTok Events API (S2S) asynchronously if pixel is configured
  if (tiktok_pixel_enabled && tiktok_pixel_id && tiktok_access_token) {
    const pageUrl = request.url
    const eventId = `${link_id}-${Date.now()}`
    const tiktokPayload = {
      pixel_code: tiktok_pixel_id as string,
      event: 'Contact',
      event_id: eventId,
      timestamp: new Date().toISOString(),
      context: {
        page: { url: pageUrl },
        ip: ip || undefined,
        user_agent: userAgent || undefined,
      },
    }
    fetch(
      `https://business-api.tiktok.com/open_api/v1.3/pixel/track/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': tiktok_access_token as string,
        },
        body: JSON.stringify(tiktokPayload),
      }
    ).catch((err) => {
      console.error('[TikTok Events API] Failed to send event:', err)
    })
  }

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

  // Always 302 redirect - never return JSON or HTML
  return NextResponse.redirect(redirectUrl, { status: 302 })
}