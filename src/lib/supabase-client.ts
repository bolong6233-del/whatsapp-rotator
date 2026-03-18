import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Fallback placeholders prevent build-time errors when env vars are not set.
// Real values must be configured via environment variables at runtime.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)
