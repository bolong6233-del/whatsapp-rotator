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

function buildRedirectUrl(phoneNumber: string, platform: string): string {
  const clean = phoneNumber.trim()
  switch (platform) {
    case 'telegram':
      return `https://t.me/${clean}`
    case 'line':
      return `https://line.me/ti/p/${clean}`
    case 'whatsapp':
    default:
      return `https://wa.me/${clean.replace(/[^0-9]/g, '')}`
  }
}

function buildPixelHtml(pixelId: string, redirectUrl: string): string {
  const safePixelId = pixelId.replace(/['"<>&]/g, '')
  const safeRedirectUrl = redirectUrl.replace(/'/g, '%27')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>跳转中...</title>
  <style>
    body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0fdf4; font-family: sans-serif; }
    .loading { text-align: center; color: #16a34a; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #16a34a; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>正在跳转中...</p>
  </div>
  <script>
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};
      var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
      var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${safePixelId}');
      ttq.page();
      ttq.track('SubmitForm');
      setTimeout(function() { window.location.href = '${safeRedirectUrl}'; }, 800);
    }(window, document, 'ttq');
  </script>
</body>
</html>`
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

  try {
    const { data, error } = await supabase.rpc('increment_and_get_number', {
      p_slug: slug,
    })

    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: 'Short link not found' }, { status: 404 })
    }

    const { phone_number, number_id, link_id, platform, tiktok_pixel_enabled, tiktok_pixel_id } = data[0]

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

    const redirectUrl = buildRedirectUrl(phone_number, platform || 'whatsapp')

    if (tiktok_pixel_enabled && tiktok_pixel_id) {
      const html = buildPixelHtml(tiktok_pixel_id, redirectUrl)
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return NextResponse.redirect(redirectUrl, { status: 302 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
