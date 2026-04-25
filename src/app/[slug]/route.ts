import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { ALLOWED_TIKTOK_EVENTS, ALLOWED_FB_EVENTS } from '@/lib/utils'

// NOTE: Run the following migrations in Supabase before deploying:
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_event_type TEXT DEFAULT 'SubmitForm';
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_pixel_enabled BOOLEAN DEFAULT FALSE;
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_pixel_id TEXT;
// ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_event_type TEXT DEFAULT 'Lead';
// See supabase/migrations/023_add_cloak_fields.sql for cloaking fields.

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

// ---------------------------------------------------------------------------
// Cloaking helpers (Edge-compatible – no Node.js APIs)
// ---------------------------------------------------------------------------

interface CloakConfig {
  cloak_enabled: boolean
  cloak_audit_url: string | null
  cloak_mode: string | null
  cloak_target_regions: string[] | null
  cloak_sources: string[] | null
  cloak_block_ip_repeat: boolean
  cloak_block_pc: boolean
}

type CloakDecision =
  | { allow: true }
  | { allow: false; reason: 'block_pc' | 'wrong_country' | 'wrong_source' | 'ip_repeat' | 'mode_audit' }

/**
 * Detect whether the request matches a given traffic source.
 * Uses both referer and User-Agent for double identification.
 */
function matchesSource(source: string, referer: string | null, ua: string | null): boolean {
  const r = (referer ?? '').toLowerCase()
  const u = (ua ?? '')

  switch (source) {
    case 'tiktok':
      return r.includes('tiktok.com') || /TikTok|BytedanceWebview|musical_ly/.test(u)
    case 'facebook':
      return (
        r.includes('facebook.com') ||
        r.includes('fb.com') ||
        r.includes('m.facebook.com') ||
        r.includes('l.facebook.com') ||
        /FBAN|FBAV/.test(u)
      )
    case 'x':
      return r.includes('x.com') || r.includes('twitter.com') || r.includes('t.co') || /Twitter/.test(u)
    case 'google':
      return r.includes('google.') || /GoogleAdsBot/.test(u)
    case 'instagram':
      return r.includes('instagram.com') || /Instagram/.test(u)
    default:
      return false
  }
}

/**
 * Core cloaking decision logic.
 * IMPORTANT: does NOT query cloak_ip_visits here — that is done by the caller
 * to avoid unnecessary DB round-trips when block_ip_repeat is disabled.
 */
function evaluateCloak(
  config: CloakConfig,
  opts: {
    device_type: string | null
    country: string | null
    referer: string | null
    userAgent: string | null
    ipAlreadyVisited: boolean
  }
): CloakDecision {
  const mode = config.cloak_mode ?? 'cloak'

  // Mode B: open — always allow
  if (mode === 'open') {
    return { allow: true }
  }

  // Mode C: audit — always block
  if (mode === 'audit') {
    return { allow: false, reason: 'mode_audit' }
  }

  // Mode A: cloak — sequential checks
  // 1. Block PC
  if (config.cloak_block_pc && opts.device_type === 'Desktop') {
    return { allow: false, reason: 'block_pc' }
  }

  // 2. Country check
  const regions = config.cloak_target_regions ?? []
  if (regions.length > 0) {
    const visitCountry = (opts.country ?? '').toUpperCase()
    if (!visitCountry || !regions.map((r) => r.toUpperCase()).includes(visitCountry)) {
      return { allow: false, reason: 'wrong_country' }
    }
  }

  // 3. Source check (only when sources are selected)
  const sources = config.cloak_sources ?? []
  if (sources.length > 0) {
    const matched = sources.some((src) => matchesSource(src, opts.referer, opts.userAgent))
    if (!matched) {
      return { allow: false, reason: 'wrong_source' }
    }
  }

  // 4. IP repeat check
  if (config.cloak_block_ip_repeat && opts.ipAlreadyVisited) {
    return { allow: false, reason: 'ip_repeat' }
  }

  return { allow: true }
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
    if (isDebug && process.env.NODE_ENV === 'development') {
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

  // ---------------------------------------------------------------------------
  // Cloaking logic – runs before click_logs to allow early return on block
  // ---------------------------------------------------------------------------
  // Fetch cloak config (extra SELECT — does NOT modify the RPC signature)
  const { data: cloakConfig } = await supabase
    .from('short_links')
    .select('cloak_enabled, cloak_audit_url, cloak_mode, cloak_target_regions, cloak_sources, cloak_block_ip_repeat, cloak_block_pc')
    .eq('id', link_id)
    .maybeSingle()

  if (cloakConfig?.cloak_enabled) {
    // Only query cloak_ip_visits when block_ip_repeat is enabled (performance optimisation)
    let ipAlreadyVisited = false
    if (cloakConfig.cloak_block_ip_repeat && ip) {
      const { data: ipVisit } = await supabase
        .from('cloak_ip_visits')
        .select('visit_count')
        .eq('short_link_id', link_id)
        .eq('ip', ip)
        .maybeSingle()
      ipAlreadyVisited = (ipVisit?.visit_count ?? 0) >= 1
    }

    const decision = evaluateCloak(cloakConfig as CloakConfig, {
      device_type,
      country,
      referer,
      userAgent,
      ipAlreadyVisited,
    })

    if (!decision.allow) {
      // Async: record the blocked click (non-blocking)
      if (!is_hidden) {
        waitUntil(
          Promise.resolve(
            supabase.from('click_logs').insert({
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
              was_cloaked: true,
              cloak_reason: decision.reason,
            }).then(({ error }) => {
              if (error) console.error('[click_logs] cloak insert failed:', error.message)
            })
          )
        )
      }
      const auditUrl = cloakConfig.cloak_audit_url?.trim() || 'https://www.google.com'
      return noCacheRedirect(auditUrl)
    }

    // Allowed: upsert IP visit record when block_ip_repeat is enabled
    if (cloakConfig.cloak_block_ip_repeat && ip) {
      waitUntil(
        Promise.resolve(
          supabase.rpc('upsert_cloak_ip_visit', { p_short_link_id: link_id, p_ip: ip })
            .then(({ error }) => {
              if (error) console.error('[cloak_ip_visits] upsert failed:', error.message)
            })
        )
      )
    }
  }
  // ---------------------------------------------------------------------------

  if (!is_hidden && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const logPromise = Promise.resolve(
      supabase.from('click_logs').insert({
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
        was_cloaked: false,
      }).then(({ error }) => {
        if (error) {
          console.error('[click_logs] Failed to insert click log:', error.message)
        }
      })
    )

    waitUntil(logPromise)
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

    // FB beacon (pure sendBeacon, no SDK)
    let fbBeacon = ''
    if (hasFbPixel) {
      const fbEvent = ALLOWED_FB_EVENTS.includes(fb_event_type as string)
        ? (fb_event_type as string)
        : 'Lead'
      fbBeacon = `
(function(){
  try {
    var eid=(crypto.randomUUID&&crypto.randomUUID())||(Date.now()+'-'+Math.random().toString(36).slice(2));
    var url='https://www.facebook.com/tr/?id='+encodeURIComponent(${JSON.stringify(fb_pixel_id as string)})+'&ev='+encodeURIComponent(${JSON.stringify(fbEvent)})+'&eid='+encodeURIComponent(eid)+'&noscript=1';
    if(typeof navigator.sendBeacon==='function'){navigator.sendBeacon(url);}else{fetch(url,{method:'GET',keepalive:true,mode:'no-cors'}).catch(function(){});}
  }catch(e){}
})();`
    }

    // TK beacon (pure sendBeacon, no SDK)
    let tkBeacon = ''
    if (hasTiktokPixel) {
      const tkEvent = ALLOWED_TIKTOK_EVENTS.includes(tiktok_event_type as string)
        ? (tiktok_event_type as string)
        : 'SubmitForm'
      tkBeacon = `
(function(){
  try {
    var eid=(crypto.randomUUID&&crypto.randomUUID())||(Date.now()+'-'+Math.random().toString(36).slice(2));
    var url='https://analytics.tiktok.com/api/v2/pixel/track?pixel_code='+encodeURIComponent(${JSON.stringify(tiktok_pixel_id as string)})+'&event='+encodeURIComponent(${JSON.stringify(tkEvent)})+'&event_id='+encodeURIComponent(eid);
    if(typeof navigator.sendBeacon==='function'){navigator.sendBeacon(url);}else{fetch(url,{method:'GET',keepalive:true,mode:'no-cors'}).catch(function(){});}
  }catch(e){}
})();`
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex,nofollow" />
<script>
${fbBeacon}
${tkBeacon}
window.location.replace(${safeRedirectUrl});
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
