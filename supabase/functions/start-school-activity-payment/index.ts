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
  if (!url || !anonKey || !serviceKey || !flutterwaveKey) return respond({ error: 'Activity payments are not configured.' }, 503)
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return respond({ error: 'Sign in as a parent to pay for a learner activity.' }, 401)

  let input: { activity_id?: unknown; student_id?: unknown }
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > 4096) return respond({ error: 'Request is too large.' }, 413)
    input = JSON.parse(raw)
  } catch { return respond({ error: 'Send a valid activity and learner selection.' }, 400) }
  const activityId = typeof input.activity_id === 'string' ? input.activity_id : ''
  const studentId = typeof input.student_id === 'string' ? input.student_id : ''
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(activityId) || !uuidPattern.test(studentId)) return respond({ error: 'Choose an activity and one linked learner.' }, 400)

  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user }, error: authError } = await auth.auth.getUser(token)
  if (authError || !user) return respond({ error: 'Your sign-in session has expired. Sign in again.' }, 401)
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: profile, error: profileError } = await admin.from('profiles').select('id,school_id,role,is_active,full_name').eq('id', user.id).maybeSingle()
  if (profileError || profile?.role !== 'parent' || profile.is_active !== true || !profile.school_id) return respond({ error: 'Only an active parent can pay for a learner activity.' }, 403)

  const [{ data: activity, error: activityError }, { data: learner, error: learnerError }, { data: guardian, error: guardianError }, { data: school, error: schoolError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    admin.from('school_activities').select('id,school_id,title,class_id,starts_at,registration_deadline,is_free,amount,currency_code,status').eq('id', activityId).eq('school_id', profile.school_id).maybeSingle(),
    admin.from('students').select('id,school_id,class_id,admission_number').eq('id', studentId).eq('school_id', profile.school_id).maybeSingle(),
    admin.from('student_guardians').select('student_id').eq('student_id', studentId).eq('guardian_id', profile.id).maybeSingle(),
    admin.from('schools').select('id,name,status').eq('id', profile.school_id).maybeSingle(),
    admin.from('subscriptions').select('status,ends_at').eq('school_id', profile.school_id).maybeSingle(),
  ])
  if (activityError || learnerError || guardianError || schoolError || subscriptionError) return respond({ error: 'Could not verify the activity, learner, or school subscription.' }, 503)
  if (!activity || !learner || !guardian) return respond({ error: 'Choose a learner linked to your parent account and an activity at your school.' }, 403)
  if (activity.status !== 'published' || activity.is_free || Number(activity.amount) <= 0) return respond({ error: 'This activity is not accepting online payments.' }, 409)
  if (!activity.starts_at || new Date(activity.starts_at).getTime() <= Date.now()) return respond({ error: 'Registration has closed because this activity has started.' }, 409)
  if (activity.class_id && activity.class_id !== learner.class_id) return respond({ error: 'This learner is not eligible for that class activity.' }, 403)
  if (activity.registration_deadline && new Date(activity.registration_deadline).getTime() <= Date.now()) return respond({ error: 'The registration deadline for this activity has passed.' }, 409)
  if (!school || school.status !== 'active' || !subscription || !['trial', 'active'].includes(subscription.status) || !subscription.ends_at || new Date(subscription.ends_at).getTime() <= Date.now()) {
    return respond({ error: 'This school workspace is not currently accepting activity payments.' }, 409)
  }

  const { data: existingRegistration, error: registrationLookupError } = await admin.from('school_activity_registrations').select('id,status').eq('activity_id', activity.id).eq('student_id', learner.id).maybeSingle()
  if (registrationLookupError) return respond({ error: 'Could not check the learner activity registration.' }, 503)
  if (existingRegistration?.status === 'paid' || existingRegistration?.status === 'registered') return respond({ error: 'This learner is already registered for the activity.' }, 409)

  const { data: registration, error: registrationError } = await admin.from('school_activity_registrations').upsert({
    ...(existingRegistration?.id ? { id: existingRegistration.id } : {}),
    school_id: profile.school_id, activity_id: activity.id, student_id: learner.id,
    parent_id: profile.id, registered_by: profile.id, status: 'pending_payment', registered_at: new Date().toISOString(), paid_at: null,
  }, { onConflict: 'activity_id,student_id' }).select('id').single()
  if (registrationError || !registration) return respond({ error: 'Could not prepare this learner registration.' }, 503)

  const txRef = `ACT-${profile.school_id}-${crypto.randomUUID()}`
  const amount = Number(activity.amount)
  const currency = String(activity.currency_code || 'KES').toUpperCase()
  const { error: attemptError } = await admin.from('school_activity_payment_attempts').insert({
    tx_ref: txRef, school_id: profile.school_id, activity_id: activity.id, registration_id: registration.id,
    student_id: learner.id, student_reference: learner.admission_number || null,
    parent_id: profile.id, amount, currency_code: currency, status: 'pending',
  })
  if (attemptError) return respond({ error: 'Could not create a secure activity payment attempt.' }, 503)

  const learnerLabel = learner.admission_number ? `learner ${learner.admission_number}` : 'learner'
  const checkout = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${flutterwaveKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: txRef, amount, currency,
      redirect_url: `${origin}/activities?payment=return`,
      customer: { email: user.email, name: profile.full_name || user.email },
      customizations: { title: `${school.name} activity`, description: `${activity.title} · ${learnerLabel}` },
      meta: { school_id: profile.school_id, activity_id: activity.id, student_id: learner.id, registration_id: registration.id },
    }),
  })
  const result = await checkout.json().catch(() => ({}))
  const checkoutUrl = result?.data?.link
  if (!checkout.ok || result?.status !== 'success' || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://checkout.flutterwave.com/')) {
    await admin.from('school_activity_payment_attempts').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('tx_ref', txRef)
    return respond({ error: 'Flutterwave could not start checkout. Check the configured merchant account.' }, 502)
  }
  return respond({ checkout_url: checkoutUrl })
})
