import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ALLOWED_TIKTOK_EVENTS } from '@/lib/utils'

// NOTE: Run the following migrations in Supabase before deploying:
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_event_type TEXT DEFAULT 'SubmitForm';
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_pixel_enabled BOOLEAN DEFAULT FALSE;
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_pixel_id TEXT;
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_event_type TEXT DEFAULT 'Lead';

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
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'sw.js',
  'service-worker.js',
  '.well-known',
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

  // Browser – order matters
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

function noCacheRedirect(url: string, status = 303): NextResponse {
  const res = NextResponse.redirect(url, { status })
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  res.headers.set('Vary', '*')
  return res
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
    return noCacheRedirect(WHATSAPP_FALLBACK)
  }

  // Detect prefetch/prerender requests - these should NOT trigger rotation
  const purpose = request.headers.get('purpose') || request.headers.get('x-purpose') || ''
  const secPurpose = request.headers.get('sec-purpose') || ''
  const isPrefetch =
    purpose.toLowerCase().includes('prefetch') ||
    secPurpose.toLowerCase().includes('prefetch') ||
    secPurpose.toLowerCase().includes('prerender') ||
    request.headers.get('x-moz') === 'prefetch'

  if (isPrefetch) {
    // Return 204 with no-cache headers but don't trigger RPC rotation
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
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
  }

  if (rpcError || noData) {
    if (isDebug) {
      return NextResponse.json({ error: 'Redirect failed', rpcError, rpcData, slug }, { status: 500 })
    }
    return noCacheRedirect(WHATSAPP_FALLBACK)
  }

  const {
    phone_number,
    number_id,
    link_id,
    platform,
    is_hidden,
    tiktok_pixel_enabled,
    tiktok_pixel_id,
    tiktok_event_type,
    fb_pixel_enabled,
    fb_pixel_id,
    fb_event_type,
    auto_reply_enabled,
    auto_reply_messages,
    auto_reply_index,
  } = rpcData[0]

  // [Fix] Safer IP resolution to prevent IP spoofing
  const ip = request.headers.get('x-real-ip') || 
             request.headers.get('x-vercel-forwarded-for') || 
             request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
             null

  const userAgent = request.headers.get('user-agent') || null
  const referer = request.headers.get('referer') || null
  const country = request.headers.get('x-vercel-ip-country') || null
  const rawCity = request.headers.get('x-vercel-ip-city')
  const city = rawCity ? decodeURIComponent(rawCity) : null

  const { os, browser, device_type } = parseUserAgent(userAgent)
  let logError = null

  if (!is_hidden && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const { error } = await supabase.from('click_logs').insert({
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
    logError = error
  }
  
  if (logError) {
    console.error('[click_logs] Failed to insert click log:', logError.message)
  }

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

  const hasTiktokPixel = tiktok_pixel_enabled && tiktok_pixel_id
  const hasFbPixel = fb_pixel_enabled && fb_pixel_id

  if (hasTiktokPixel || hasFbPixel) {
    const safeRedirectUrl = JSON.stringify(redirectUrl)
    let pixelScripts = ''

    if (hasTiktokPixel) {
      const safePixelId = JSON.stringify(tiktok_pixel_id as string)
      const rawEventType = (tiktok_event_type as string) ?? 'SubmitForm'
      const eventType = ALLOWED_TIKTOK_EVENTS.includes(rawEventType) ? rawEventType : 'SubmitForm'
      const safeEventType = JSON.stringify(eventType)
      pixelScripts += `
<script>
!function(w,d,t){
  w.TiktokAnalyticsObject=t;
  var ttq=w[t]=w[t]||[];
  ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
  ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))};
  };
  for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
  ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
  ttq.load=function(e,n){
    var i="https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
    var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
    var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)
  };
  ttq.load(${safePixelId});
  ttq.track(${safeEventType});
}(window,document,"ttq");
</script>`
    }

    if (hasFbPixel) {
      const safeFbPixelId = JSON.stringify(fb_pixel_id as string)
      const fbEvent = (fb_event_type as string) ?? 'Lead'
      const safeFbEventType = JSON.stringify(fbEvent)
      pixelScripts += `
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${safeFbPixelId});
fbq('track', ${safeFbEventType});
</script>`
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex,nofollow" />
${pixelScripts}
<script>
setTimeout(function(){window.location.href=${safeRedirectUrl};},${TIKTOK_PIXEL_REDIRECT_DELAY_MS});
</script>
</head>
<body></body>
</html>`
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  }
  return noCacheRedirect(redirectUrl)
}
