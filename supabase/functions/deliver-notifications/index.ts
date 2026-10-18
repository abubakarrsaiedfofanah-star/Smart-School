import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const encoder = new TextEncoder()
const safeEqual = (left: string, right: string) => {
  const a = encoder.encode(left); const b = encoder.encode(right)
  if (a.length !== b.length) return false
  let result = 0
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index]
  return result === 0
}

async function sign(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const workerSecret = Deno.env.get('NOTIFICATION_WORKER_SECRET') || ''
  const deliveryUrl = Deno.env.get('NOTIFICATION_DELIVERY_WEBHOOK_URL') || ''
  const deliverySecret = Deno.env.get('NOTIFICATION_DELIVERY_WEBHOOK_SECRET') || ''
  const serviceUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!workerSecret || !deliverySecret || !serviceUrl || !serviceKey) return Response.json({ error: 'Notification delivery is not configured.' }, { status: 503 })
  let target: URL
  try { target = new URL(deliveryUrl) } catch { return Response.json({ error: 'Delivery webhook URL is invalid.' }, { status: 503 }) }
  if (target.protocol !== 'https:') return Response.json({ error: 'Delivery webhook must use HTTPS.' }, { status: 503 })
  const authorization = request.headers.get('Authorization') || ''
  if (!safeEqual(authorization, `Bearer ${workerSecret}`)) return Response.json({ error: 'Unauthorized.' }, { status: 401 })

  let limit = 25
  try {
    const raw = await request.text()
    if (encoder.encode(raw).length > 2048) return Response.json({ error: 'Request too large.' }, { status: 413 })
    if (raw) limit = Math.min(100, Math.max(1, Number(JSON.parse(raw).limit) || 25))
  } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }) }

  const admin = createClient(serviceUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: jobs, error: claimError } = await admin.rpc('claim_notification_delivery_jobs', { p_limit: limit })
  if (claimError) return Response.json({ error: 'Could not claim notification jobs.' }, { status: 503 })
  let sent = 0; let failed = 0; let cancelled = 0
  for (const job of jobs || []) {
    const finish = async (success: boolean, code: string | null = null, retryable = true, isCancelled = false) => {
      const { error } = await admin.rpc('finish_notification_delivery_job', {
        p_outbox_id: job.outbox_id, p_success: success, p_error_code: code, p_retryable: retryable, p_cancelled: isCancelled
      })
      if (error) throw error
    }
    try {
      const { data: profile, error: profileError } = await admin.from('profiles').select('school_id,phone,is_active,delivery_preferences').eq('id', job.recipient_id).maybeSingle()
      if (profileError) throw new Error('recipient_lookup_failed')
      if (!profile || profile.school_id !== job.school_id || profile.is_active === false || profile.delivery_preferences?.[job.channel] !== true) {
        await finish(false, 'recipient_opted_out', false, true); cancelled += 1; continue
      }
      let destination: string | string[] | null = profile.phone || null
      if (job.channel === 'email') {
        const { data, error } = await admin.auth.admin.getUserById(job.recipient_id)
        if (error) throw new Error('recipient_lookup_failed')
        destination = data.user?.email || null
      } else if (job.channel === 'push') {
        const { data, error } = await admin.from('push_devices').select('device_token').eq('user_id', job.recipient_id).eq('school_id', job.school_id).eq('active', true)
        if (error) throw new Error('push_device_lookup_failed')
        destination = (data || []).map(device => device.device_token)
      }
      if (!destination || (Array.isArray(destination) && destination.length === 0)) {
        await finish(false, job.channel === 'push' ? 'push_device_missing' : 'recipient_address_missing', false); failed += 1; continue
      }
      const payload = JSON.stringify({
        event: 'smartschool.notification', delivery_id: job.outbox_id, notification_id: job.notification_id,
        school_id: job.school_id, recipient_id: job.recipient_id, channel: job.channel,
        destination, notification: { title: job.title, body: job.body }
      })
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = await sign(deliverySecret, timestamp, payload)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      let response: Response
      try {
        response = await fetch(target, { method: 'POST', headers: {
          'Content-Type': 'application/json', 'X-SmartSchool-Timestamp': timestamp, 'X-SmartSchool-Signature': `v1=${signature}`
        }, body: payload, signal: controller.signal })
      } finally { clearTimeout(timeout) }
      if (response.ok) { await finish(true); sent += 1 }
      else {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500
        await finish(false, `provider_http_${response.status}`, retryable); failed += 1
      }
    } catch (error) {
      const code = error instanceof DOMException && error.name === 'AbortError' ? 'provider_timeout' : error instanceof Error ? error.message : 'delivery_failed'
      try { await finish(false, code, true) } catch { /* The lease will be reclaimed after its timeout if completion failed. */ }
      failed += 1
    }
  }
  return Response.json({ claimed: jobs?.length || 0, sent, failed, cancelled })
})
