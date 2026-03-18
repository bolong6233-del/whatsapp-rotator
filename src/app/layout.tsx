import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WhatsApp 轮询分流系统',
  description: 'WhatsApp 智能短链生成与轮询分流系统，助力广告营销',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">{children}</body>
    </html>
  )
}
