import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '无敌牛子分流系统',
  description: '无敌牛子智能短链生成与分流系统，助力广告营销',
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
