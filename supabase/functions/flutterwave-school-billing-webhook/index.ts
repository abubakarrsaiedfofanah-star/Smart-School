import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const equalSecret = (left: string, right: string) => {
  if (!left || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 })
  const secretHash = Deno.env.get('FLW_SECRET_HASH') || ''
  if (!equalSecret(request.headers.get('verif-hash') || '', secretHash)) return new Response('Unauthorized.', { status: 401 })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const flutterwaveKey = Deno.env.get('FLW_SECRET_KEY')
  if (!url || !serviceKey || !flutterwaveKey) return new Response('Billing webhook is not configured.', { status: 503 })

  let payload: Record<string, any>
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > 65536) return new Response('Request is too large.', { status: 413 })
    payload = JSON.parse(raw)
  } catch { return new Response('Invalid JSON.', { status: 400 }) }

  const event = typeof payload.event === 'string' ? payload.event : ''
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  if (!['charge.completed', 'subscription.cancelled'].includes(event)) return new Response('OK', { status: 200 })

  let status = event === 'subscription.cancelled' ? 'cancelled' : String(data.status || '').toLowerCase()
  let transactionId = data.id == null ? '' : String(data.id)
  let txRef = typeof data.tx_ref === 'string' ? data.tx_ref : ''
  let amount = Number(data.charged_amount ?? data.amount)
  let currency = typeof data.currency === 'string' ? data.currency.toUpperCase() : ''
  let customerEmail = typeof data.customer?.email === 'string' ? data.customer.email.toLowerCase() : ''

  if (event === 'charge.completed') {
    if (!transactionId || !['successful', 'failed'].includes(status)) return new Response('Invalid payment event.', { status: 400 })
    const verification = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${flutterwaveKey}` },
    })
    const verified = await verification.json().catch(() => ({}))
    const transaction = verified?.data
    if (!verification.ok || verified?.status !== 'success' || !transaction) return new Response('Could not verify transaction.', { status: 502 })
    status = String(transaction.status || '').toLowerCase()
    if (!['successful', 'failed'].includes(status)) return new Response('Payment is not final.', { status: 409 })
    txRef = typeof transaction.tx_ref === 'string' ? transaction.tx_ref : txRef
    amount = Number(transaction.charged_amount ?? transaction.amount)
    currency = typeof transaction.currency === 'string' ? transaction.currency.toUpperCase() : currency
    customerEmail = typeof transaction.customer?.email === 'string' ? transaction.customer.email.toLowerCase() : customerEmail
  }

  const identity = `${event}:${transactionId || txRef || customerEmail}:${status}`
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const isActivityPayment = txRef.startsWith('ACT-')
  const { error } = isActivityPayment
    ? await admin.rpc('process_flutterwave_school_activity_event', {
      p_event_key: identity,
      p_tx_ref: txRef,
      p_transaction_id: transactionId || null,
      p_status: status,
      p_currency_code: currency || null,
      p_amount: Number.isFinite(amount) ? amount : null,
    })
    : await admin.rpc('process_flutterwave_school_billing_event', {
      p_event_key: identity,
      p_event_name: event,
      p_tx_ref: txRef || null,
      p_transaction_id: transactionId || null,
      p_status: status,
      p_currency_code: currency || null,
      p_amount: Number.isFinite(amount) ? amount : null,
      p_customer_email: customerEmail || null,
    })
  if (error) {
    console.error('Could not apply verified Flutterwave school billing event:', error.message)
    return new Response('Could not apply billing event.', { status: 500 })
  }
  return new Response('OK', { status: 200 })
})
