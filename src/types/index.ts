export interface ShortLink {
  id: string
  user_id: string
  slug: string
  title: string | null
  description: string | null
  current_index: number
  total_clicks: number
  is_active: boolean
  tiktok_pixel_enabled: boolean
  tiktok_pixel_id: string | null
  auto_reply_enabled: boolean
  auto_reply_messages: string | null
  auto_reply_index: number
  created_at: string
  updated_at: string
  whatsapp_numbers?: WhatsAppNumber[]
}

export type Platform = 'whatsapp' | 'telegram' | 'line' | 'custom'

export interface WhatsAppNumber {
  id: string
  short_link_id: string
  phone_number: string
  label: string | null
  sort_order: number
  click_count: number
  is_active: boolean
  platform: Platform
  created_at: string
}

export interface Ticket {
  id: string
  user_id: string
  title: string
  description: string | null
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  user_id: string
  message: string
  is_admin: boolean
  created_at: string
}

export interface ClickLog {
  id: string
  short_link_id: string
  whatsapp_number_id: string | null
  ip_address: string | null
  user_agent: string | null
  referer: string | null
  country: string | null
  clicked_at: string
  whatsapp_numbers?: {
    phone_number: string
    label: string | null
  }
}
