export const TIKTOK_EVENT_OPTIONS = [
  { value: 'SubmitForm', label: '提交表单' },
  { value: 'Contact', label: '联系' },
  { value: 'Download', label: '下载' },
  { value: 'CompleteRegistration', label: '完成注册' },
] as const

export type TikTokEventType = (typeof TIKTOK_EVENT_OPTIONS)[number]['value']

export const ALLOWED_TIKTOK_EVENTS: readonly string[] = TIKTOK_EVENT_OPTIONS.map((o) => o.value)

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
