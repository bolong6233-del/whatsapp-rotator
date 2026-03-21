'use client'

import React, { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Script from 'next/script'

const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID

function TikTokPixelInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // @ts-expect-error ttq is injected by TikTok Pixel script
    if (window.ttq) {
      // @ts-expect-error ttq is injected by TikTok Pixel script
      window.ttq.page()
    }
  }, [pathname, searchParams])

  return null
}

export default function TikTokPixel() {
  if (!TIKTOK_PIXEL_ID) return null

  return (
    <>
      {/* TikTok Pixel base code — https://ads.tiktok.com/help/article/tiktok-pixel */}
      <Script
        id="tiktok-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
          !function (w, d, t) {
            w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
            ttq.load('${TIKTOK_PIXEL_ID}');
            ttq.page();
          }(window, document, 'ttq');
        `,
        }}
      />
      <Suspense fallback={null}>
        <TikTokPixelInner />
      </Suspense>
    </>
  )
}
