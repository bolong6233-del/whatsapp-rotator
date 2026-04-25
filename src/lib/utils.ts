export {
  FB_PIXEL_EVENTS,
  FB_DEFAULT_EVENT,
  TIKTOK_PIXEL_EVENTS,
  TIKTOK_DEFAULT_EVENT,
} from '@/lib/pixel-events'
export type { FbEventType, TikTokEventType } from '@/lib/pixel-events'

// Legacy alias kept for backwards-compat (dashboard pages use TIKTOK_EVENT_OPTIONS)
export { TIKTOK_PIXEL_EVENTS as TIKTOK_EVENT_OPTIONS } from '@/lib/pixel-events'

import { FB_PIXEL_EVENTS, TIKTOK_PIXEL_EVENTS } from '@/lib/pixel-events'

export const ALLOWED_FB_EVENTS: readonly string[] = FB_PIXEL_EVENTS.map((o) => o.value)
export const ALLOWED_TIKTOK_EVENTS: readonly string[] = TIKTOK_PIXEL_EVENTS.map((o) => o.value)

export function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function generateSlug(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}
