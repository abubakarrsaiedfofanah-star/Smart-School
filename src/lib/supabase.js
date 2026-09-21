import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  if (import.meta.env.PROD) {
    console.error('CRITICAL: Supabase credentials missing in production environment.')
  } else {
    console.warn('Supabase credentials not found. Running in Demo Mode with local state.')
  }
}

export const supabase = url && key ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null
