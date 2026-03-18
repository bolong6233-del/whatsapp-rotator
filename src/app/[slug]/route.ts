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

function buildErrorHtml(icon: string, title: string, desc: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0fdf4;font-family:sans-serif}.box{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{font-size:4rem;margin-bottom:16px}.title{font-size:1.5rem;font-weight:700;color:#111;margin-bottom:8px}.desc{color:#6b7280}</style></head><body><div class="box"><div class="icon">${icon}</div><div class="title">${title}</div><div class="desc">${desc}</div></div></body></html>`
}

function buildPixelHtml(pixelId: string, redirectUrl: string): string {
  // TikTok Pixel IDs are alphanumeric with optional hyphens/underscores
  const safePixelId = pixelId.replace(/[^a-zA-Z0-9_-]/g, '')
  // Validate redirect URL uses a safe protocol (from our own DB, but defense-in-depth)
  let safeRedirectUrl: string
  try {
    const parsed = new URL(redirectUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      safeRedirectUrl = '#'
    } else {
      safeRedirectUrl = parsed.toString()
    }
  } catch {
    safeRedirectUrl = '#'
  }
  // JSON.stringify ensures the URL is properly JS-string-escaped
  const encodedUrl = JSON.stringify(safeRedirectUrl)
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
      setTimeout(function() { window.location.href = ${encodedUrl}; }, 800);
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
    let phone_number: string, number_id: string, link_id: string, platform: string
    let tiktok_pixel_enabled: boolean, tiktok_pixel_id: string
    let auto_reply_enabled: boolean, auto_reply_messages: string, auto_reply_index: number

    const { data: rpcData, error: rpcError } = await supabase.rpc('increment_and_get_number', {
      p_slug: slug,
    })

    if (!rpcError && rpcData && rpcData.length > 0) {
      // RPC succeeded – use its result
      ({ phone_number, number_id, link_id, platform, tiktok_pixel_enabled, tiktok_pixel_id, auto_reply_enabled, auto_reply_messages, auto_reply_index } = rpcData[0])
    } else {
      // RPC failed or returned empty – fall back to direct table queries
      const { data: linkData, error: linkError } = await supabase
        .from('short_links')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (linkError || !linkData) {
        return new Response(
          buildErrorHtml('🔗', '链接不存在', '该短链接不存在或已被删除'),
          { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      // Short link exists – fetch its active numbers
      const { data: numbers, error: numbersError } = await supabase
        .from('whatsapp_numbers')
        .select('*')
        .eq('short_link_id', linkData.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (numbersError || !numbers || numbers.length === 0) {
        return new Response(
          buildErrorHtml('📵', '暂无可用号码', '该短链接暂时没有绑定任何可用号码，请联系管理员'),
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      // Pick number using round-robin
      const currentIndex = (linkData.current_index ?? 0) % numbers.length
      const chosen = numbers[currentIndex]
      const nextIndex = (currentIndex + 1) % numbers.length

      // Update short_links counter (fire-and-forget)
      supabase
        .from('short_links')
        .update({
          current_index: nextIndex,
          total_clicks: (linkData.total_clicks ?? 0) + 1,
          auto_reply_index: (linkData.auto_reply_index ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', linkData.id)
        .then(({ error: e }) => { if (e) console.error('[fallback] short_links update:', e.message) })

      // Update number click count (fire-and-forget)
      supabase
        .from('whatsapp_numbers')
        .update({ click_count: (chosen.click_count ?? 0) + 1 })
        .eq('id', chosen.id)
        .then(({ error: e }) => { if (e) console.error('[fallback] whatsapp_numbers update:', e.message) })

      phone_number = chosen.phone_number
      number_id = chosen.id
      link_id = linkData.id
      platform = chosen.platform ?? 'whatsapp'
      tiktok_pixel_enabled = linkData.tiktok_pixel_enabled ?? false
      tiktok_pixel_id = linkData.tiktok_pixel_id ?? ''
      auto_reply_enabled = linkData.auto_reply_enabled ?? false
      auto_reply_messages = linkData.auto_reply_messages ?? ''
      auto_reply_index = linkData.auto_reply_index ?? 0
    }

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
      return new Response(
        buildErrorHtml('⚠️', '链接无效', '目标链接地址不正确，请联系管理员'),
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    if (tiktok_pixel_enabled && tiktok_pixel_id) {
      const html = buildPixelHtml(tiktok_pixel_id, redirectUrl)
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return NextResponse.redirect(redirectUrl, { status: 302 })
  } catch {
    return new Response(
      buildErrorHtml('🛠️', '服务器错误', '暂时无法处理请求，请稍后重试'),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
}
