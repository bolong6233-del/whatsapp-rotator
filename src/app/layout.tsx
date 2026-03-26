import type { Metadata } from 'next'
import './globals.css'
import TikTokPixel from '@/components/TikTokPixel'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata: Metadata = {
  title: '拓客出海',
  description: '拓客出海 - 智能短链生成与分流，助力广告营销出海',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">
        <TikTokPixel />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
