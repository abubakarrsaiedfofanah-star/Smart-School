import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = (Deno.env.get('SMARTSCHOOL_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean)
const originAllowed = (request: Request) => allowedOrigins.includes(request.headers.get('Origin') || '')
const cors = (request: Request) => ({
  ...(originAllowed(request) ? { 'Access-Control-Allow-Origin': request.headers.get('Origin')! } : {}),
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
})
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const sameSecret = (provided: string, expected: string) => {
  const left = new TextEncoder().encode(provided)
  const right = new TextEncoder().encode(expected)
  if (!expected || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index]
  return mismatch === 0
}

Deno.serve(async request => {
  const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
  if (request.method === 'OPTIONS') return originAllowed(request) ? new Response('ok', { headers: cors(request) }) : new Response(null, { status: 403 })
  if (!originAllowed(request)) return respond({ error: 'This app origin is not allowed.' }, 403)
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const bootstrapToken = Deno.env.get('SUPER_ADMIN_BOOTSTRAP_TOKEN') || ''
  if (!url || !serviceKey || !allowedOrigins.length || bootstrapToken.length < 32) {
    return respond({ error: 'First Super Admin setup is not configured.' }, 503)
  }

  let body: { full_name?: unknown; email?: unknown; password?: unknown; bootstrap_token?: unknown }
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > 8192) return respond({ error: 'Setup request is too large.' }, 413)
    body = JSON.parse(raw)
  } catch { return respond({ error: 'Send a valid setup form.' }, 400) }

  const fullName = clean(body.full_name, 160)
  const email = clean(body.email, 254).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const passwordBytes = new TextEncoder().encode(password).length
  const providedToken = typeof body.bootstrap_token === 'string' ? body.bootstrap_token : ''
  if (!sameSecret(providedToken, bootstrapToken)) return respond({ error: 'The one-time setup key is not valid.' }, 403)
  if (fullName.length < 2 || !validEmail(email) || password.length < 14 || passwordBytes > 72) {
    return respond({ error: 'Enter your name, a valid email, and a password with at least 14 characters.' }, 400)
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: available, error: statusError } = await admin.rpc('super_admin_bootstrap_available')
  if (statusError) return respond({ error: 'Could not verify first Super Admin setup. Apply migration 090 and try again.' }, 503)
  if (available !== true) return respond({ error: 'Super Admin registration is already closed. Sign in with the existing Super Admin account.' }, 409)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createError || !created.user) return respond({ error: 'Could not create this account. Check whether the email is already in use.' }, 409)

  const { data: claimed, error: claimError } = await admin.rpc('claim_first_super_admin', { p_profile_id: created.user.id })
  if (claimError || claimed !== true) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id)
    if (cleanupError) console.error('Could not remove an unclaimed bootstrap account:', cleanupError.message)
    if (claimError) console.error('Could not claim the first Super Admin account:', claimError.message)
    return respond({ error: 'Super Admin setup is closed or could not be completed. Sign in if an account already exists.' }, 409)
  }

  return respond({ message: 'Super Admin account created. Sign in to continue.' }, 201)
})
