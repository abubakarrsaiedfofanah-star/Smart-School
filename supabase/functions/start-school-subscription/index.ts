import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const origins = (Deno.env.get('SMARTSCHOOL_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean)

Deno.serve(async request => {
  const origin = request.headers.get('Origin') || ''
  const headers = {
    ...(origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
  const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (request.method === 'OPTIONS') return origins.includes(origin) ? new Response('ok', { headers }) : respond({ error: 'Origin not allowed.' }, 403)
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)
  if (!origins.includes(origin)) return respond({ error: 'Origin not allowed.' }, 403)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const flutterwaveKey = Deno.env.get('FLW_SECRET_KEY')
  if (!url || !anonKey || !serviceKey || !flutterwaveKey) return respond({ error: 'Monthly billing is not configured.' }, 503)
  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token) return respond({ error: 'Sign in as your school administrator first.' }, 401)

  let input: { plan?: unknown }
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > 4096) return respond({ error: 'Request is too large.' }, 413)
    input = JSON.parse(raw)
  } catch { return respond({ error: 'Send a valid plan request.' }, 400) }
  const plan = typeof input.plan === 'string' ? input.plan : ''
  if (!['Starter', 'Professional', 'Enterprise'].includes(plan)) return respond({ error: 'Choose a valid monthly plan.' }, 400)

  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user }, error: authError } = await auth.auth.getUser(token)
  if (authError || !user?.email) return respond({ error: 'Your sign-in session has expired. Sign in again.' }, 401)
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: profile, error: profileError } = await admin.from('profiles').select('id,school_id,role,is_active,billing_suspended_at,full_name').eq('id', user.id).maybeSingle()
  if (profileError || profile?.role !== 'school_admin' || (profile.is_active !== true && !profile.billing_suspended_at) || !profile.school_id) return respond({ error: 'Only the administrator of a school can manage its subscription.' }, 403)

  const { data: school, error: schoolError } = await admin.from('schools').select('id,name,status,suspension_reason,currency_code').eq('id', profile.school_id).maybeSingle()
  if (schoolError || !school) return respond({ error: 'Could not load your school billing details.' }, 503)
  const currencyCode = String(school.currency_code || 'KES').toUpperCase()
  const [{ data: subscription, error: subError }, { data: price, error: priceError }] = await Promise.all([
    admin.from('subscriptions').select('id,status,requested_plan').eq('school_id', profile.school_id).maybeSingle(),
    admin.from('subscription_plan_prices').select('monthly_amount,currency_code,flutterwave_plan_id').eq('plan', plan).eq('currency_code', currencyCode).maybeSingle(),
  ])
  if (subError || priceError || !subscription) return respond({ error: 'Could not load your school billing details.' }, 503)
  if (!['active', 'pending'].includes(school.status) && !(school.status === 'suspended' && school.suspension_reason === 'payment_failed')) {
    return respond({ error: 'This school cannot start checkout while its workspace is suspended by the platform.' }, 403)
  }
  if (!price) return respond({ error: `The ${plan} monthly price and Flutterwave plan have not been configured for ${currencyCode}.` }, 409)

  const txRef = `SS-${profile.school_id}-${crypto.randomUUID()}`
  const amount = Number(price.monthly_amount)
  const billingEmail = user.email.toLowerCase()
  const { error: attemptError } = await admin.from('subscription_billing_attempts').insert({
    tx_ref: txRef, school_id: profile.school_id, plan, billing_email: billingEmail,
    currency_code: price.currency_code, amount, status: 'pending',
  })
  if (attemptError) return respond({ error: 'Could not create a secure billing attempt.' }, 503)

  const { error: updateError } = await admin.from('subscriptions').update({
    billing_email: billingEmail, billing_currency: price.currency_code,
    monthly_amount: amount, flutterwave_plan_id: price.flutterwave_plan_id,
    requested_plan: plan, request_status: 'checkout_started',
  }).eq('school_id', profile.school_id)
  if (updateError) return respond({ error: 'Could not prepare this subscription.' }, 503)

  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${flutterwaveKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: txRef, amount, currency: price.currency_code,
      payment_plan: price.flutterwave_plan_id,
      redirect_url: `${origin}/subscription?payment=return`,
      customer: { email: billingEmail, name: profile.full_name || school.name },
      customizations: { title: 'SmartSchool monthly subscription', description: `${plan} monthly school plan` },
      meta: { school_id: profile.school_id, plan },
    }),
  })
  const result = await response.json().catch(() => ({}))
  const checkoutUrl = result?.data?.link
  if (!response.ok || result?.status !== 'success' || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://checkout.flutterwave.com/')) {
    await admin.from('subscription_billing_attempts').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('tx_ref', txRef)
    return respond({ error: 'Flutterwave could not start checkout. Check the configured plan and merchant account.' }, 502)
  }
  return respond({ checkout_url: checkoutUrl })
})
