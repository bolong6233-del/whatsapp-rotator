export interface ShortLink {
  id: string
  user_id: string
  slug: string
  title: string | null
  description: string | null
  current_index: number
  total_clicks: number
  is_active: boolean
  created_at: string
  updated_at: string
  whatsapp_numbers?: WhatsAppNumber[]
}

export interface WhatsAppNumber {
  id: string
  short_link_id: string
  phone_number: string
  label: string | null
  sort_order: number
  click_count: number
  is_active: boolean
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
