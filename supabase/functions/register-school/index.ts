import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const requesterHash = async (request: Request, secret: string) => {
  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(forwarded))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return reply({ error: 'School registration is not configured.' }, 503)

  let body: { school?: Record<string, unknown>; admin?: Record<string, unknown> }
  try { body = await request.json() } catch { return reply({ error: 'Send a valid school registration form.' }, 400) }
  const schoolInput = body.school || {}
  const adminInput = body.admin || {}
  const name = clean(schoolInput.name, 160)
  const schoolEmail = clean(schoolInput.email, 254).toLowerCase()
  const phone = clean(schoolInput.phone, 40)
  const address = clean(schoolInput.address, 300)
  const level = clean(schoolInput.school_level, 80)
  const plan = clean(schoolInput.subscription_plan, 30)
  const adminName = clean(adminInput.full_name, 160)
  const adminEmail = clean(adminInput.email, 254).toLowerCase()
  const adminPhone = clean(adminInput.phone, 40)
  const password = typeof adminInput.password === 'string' ? adminInput.password : ''

  if (name.length < 2 || !validEmail(schoolEmail) || phone.length < 7 || !level) return reply({ error: 'Check the school name and contact details.' }, 400)
  if (adminName.length < 2 || !validEmail(adminEmail) || password.length < 12) return reply({ error: 'Check the administrator details and use a password with at least 12 characters.' }, 400)
  if (!['Starter', 'Professional', 'Enterprise'].includes(plan)) return reply({ error: 'Choose a valid school plan.' }, 400)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: allowed, error: limitError } = await admin.rpc('consume_school_registration_attempt', { p_requester_hash: await requesterHash(request, serviceKey) })
  if (limitError) return reply({ error: 'School registration is temporarily unavailable. Please try again later.' }, 503)
  if (!allowed) return reply({ error: 'Too many school registration attempts. Wait an hour and try again.' }, 429)
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)}-${crypto.randomUUID().slice(0, 8)}`
  const { data: school, error: schoolError } = await admin.from('schools').insert({
    name, slug, email: schoolEmail, phone, address, school_level: level,
    subscription_plan: plan, status: 'pending', admin_email: adminEmail,
    mpesa_paybill: clean(schoolInput.mpesa_paybill, 80),
    mpesa_till: clean(schoolInput.mpesa_till, 80),
    bank_name: clean(schoolInput.bank_name, 120),
    bank_account_name: clean(schoolInput.bank_account_name, 160),
    bank_account_number: clean(schoolInput.bank_account_number, 80),
    region: 'Nairobi',
  }).select('id').single()
  if (schoolError || !school) return reply({ error: schoolError?.message || 'Could not create the school request.' }, 400)

  const rollbackSchool = async () => {
    const { error } = await admin.from('schools').delete().eq('id', school.id)
    if (error) console.error('Could not roll back incomplete school registration:', school.id, error.message)
  }

  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: account, error: signupError } = await auth.auth.signUp({
    email: adminEmail,
    password,
    options: { data: { full_name: adminName, phone: adminPhone, role: 'school_admin', school_id: school.id } },
  })
  if (signupError || !account.user || (Array.isArray(account.user.identities) && account.user.identities.length === 0)) {
    await rollbackSchool()
    const duplicate = !signupError && account.user && Array.isArray(account.user.identities) && account.user.identities.length === 0
    return reply({ error: duplicate ? 'That administrator email already has an account. Sign in or use a different email.' : signupError?.message || 'Could not create the school administrator account.' }, duplicate ? 409 : 400)
  }

  return reply({ message: 'School request submitted. Verify the administrator email if prompted. Your school portals open after platform approval.' }, 201)
})
