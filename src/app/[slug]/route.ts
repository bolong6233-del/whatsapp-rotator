import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Fallback: redirect to WhatsApp with empty phone (shows friendly error page)
const WHATSAPP_FALLBACK = 'https://api.whatsapp.com/send/?phone='

// Delay (ms) before redirecting when a TikTok Pixel page is rendered,
// giving the pixel script enough time to fire before navigation.
const TIKTOK_PIXEL_REDIRECT_DELAY_MS = 500

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

/**
 * Lightweight User-Agent parser.
 * Extracts OS, browser, and device type without any external dependency.
 * Safe for use in Edge Runtime.
 */
function parseUserAgent(ua: string | null): {
  os: string | null
  browser: string | null
  device_type: string | null
} {
  if (!ua) return { os: null, browser: null, device_type: null }

  // Device type – check mobile/tablet signals before desktop fallback
  let device_type: string
  if (/Mobile|iPhone|iPod|Android.*Mobile|Windows Phone/.test(ua)) {
    device_type = 'Mobile'
  } else if (/iPad|Android(?!.*Mobile)|Tablet/.test(ua)) {
    device_type = 'Tablet'
  } else {
    device_type = 'Desktop'
  }

  // Operating system
  let os: string | null = null
  if (/iPhone|iPod/.test(ua)) {
    os = 'iOS'
  } else if (/iPad/.test(ua)) {
    os = 'iPadOS'
  } else if (/Android/.test(ua)) {
    os = 'Android'
  } else if (/Windows/.test(ua)) {
    os = 'Windows'
  } else if (/Mac OS X/.test(ua)) {
    os = 'macOS'
  } else if (/Linux/.test(ua)) {
    os = 'Linux'
  }

  // Browser – order matters: Edge/OPR must precede Chrome; Samsung must precede Chrome;
  // Safari UA always contains "Safari/" but also "Chrome/" when it's actually Chrome,
  // so Chrome must match before Safari.
  let browser: string | null = null
  if (/Edg\//.test(ua)) {
    browser = 'Edge'
  } else if (/OPR\/|Opera/.test(ua)) {
    browser = 'Opera'
  } else if (/SamsungBrowser/.test(ua)) {
    browser = 'Samsung'
  } else if (/Chrome\//.test(ua)) {
    browser = 'Chrome'
  } else if (/Firefox\//.test(ua)) {
    browser = 'Firefox'
  } else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    browser = 'Safari'
  }

  return { os, browser, device_type }
}

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

  // Geo data from Vercel edge headers (populated automatically on Vercel deployments)
  const country = request.headers.get('x-vercel-ip-country') || null
  const rawCity = request.headers.get('x-vercel-ip-city')
  const city = rawCity ? decodeURIComponent(rawCity) : null

  // Log the click synchronously to guarantee the write completes before redirecting.
  // waitUntil from @vercel/functions silently swallows the promise in Edge App Router,
  // so we await directly here. The Supabase HTTP call is fast (< 100ms) on the same region.
  const { os, browser, device_type } = parseUserAgent(userAgent)
  const { error: logError } = await supabase.from('click_logs').insert({
    short_link_id: link_id,
    whatsapp_number_id: number_id,
    ip_address: ip,
    user_agent: userAgent,
    referer: referer,
    country: country,
    city: city,
    os: os,
    browser: browser,
    device_type: device_type,
  })
  if (logError) {
    console.error('[click_logs] Failed to insert click log:', logError.message)
  }

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
    await fetch(
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

  // If a client-side TikTok Pixel is configured, return an intermediate HTML page
  // that fires the pixel before performing the redirect. A plain 302 would cause
  // the browser to navigate away before the pixel script has a chance to execute.
  if (tiktok_pixel_enabled && tiktok_pixel_id) {
    // JSON.stringify escapes the values so they are safe to embed inside a JS string literal.
    const safePixelId = JSON.stringify(tiktok_pixel_id as string)
    const safeRedirectUrl = JSON.stringify(redirectUrl)
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex,nofollow" />
<script>
!function(w,d,t){
  w.TiktokAnalyticsObject=t;
  var ttq=w[t]=w[t]||[];
  ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
  ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
  for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
  ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
  ttq.load=function(e,n){
    var i="https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
    var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
    var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)
  };
  ttq.load(${safePixelId});
  ttq.page();
  ttq.track('SubmitForm');
}(window,document,"ttq");
setTimeout(function(){window.location.href=${safeRedirectUrl};},${TIKTOK_PIXEL_REDIRECT_DELAY_MS});
</script>
</head>
<body>
<p>正在为您跳转，请稍候...</p>
</body>
</html>`
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // No pixel configured — plain 302 redirect
  return NextResponse.redirect(redirectUrl, { status: 302 })
}