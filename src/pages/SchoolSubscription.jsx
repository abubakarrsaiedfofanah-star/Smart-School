import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

const plans = [
  ['Starter', 'Core school routines and learner records.'],
  ['Professional', 'Broader academic and school operations.'],
  ['Enterprise', 'A larger school setup with platform review.'],
]

export default function SchoolSubscription() {
  const { profile, school } = useAuth()
  const [searchParams] = useSearchParams()
  const [billingSchool, setBillingSchool] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [prices, setPrices] = useState([])
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const currencyCode = String(billingSchool?.currency_code || school?.currency_code || 'KES').toUpperCase()
  const priceFor = useMemo(() => plan => prices.find(item => item.plan === plan && item.currency_code === currencyCode), [prices, currencyCode])

  const loadSubscription = useCallback(async () => {
    if (!supabase || !profile?.school_id) { setLoading(false); return }
    const { data, error } = await supabase.rpc('get_my_school_billing_overview')
    if (error) toast.error(`Could not load billing details: ${error.message}`)
    setBillingSchool(data?.school || null)
    setSubscription(data?.subscription || null)
    setPrices(data?.prices || [])
    setAttempts(data?.attempts || [])
    setLoading(false)
  }, [profile?.school_id])

  useEffect(() => { loadSubscription() }, [loadSubscription])
  useEffect(() => {
    if (searchParams.get('payment') === 'return') {
      toast('Payment received for verification. This page will update when the provider confirms it.')
      const timer = window.setTimeout(() => { void loadSubscription() }, 2500)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [loadSubscription, searchParams])

  async function startMonthlySubscription(plan) {
    if (!supabase) return toast.error('Connect Supabase to manage this school subscription.')
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('start-school-subscription', { body: { plan } })
    setSaving(false)
    if (error || !data?.checkout_url) return toast.error(data?.error || error?.message || 'Could not start monthly checkout.')
    window.location.assign(data.checkout_url)
  }

  if (loading) return <div className="portal-loading"><div className="spinner" /></div>
  const status = subscription?.status || 'not configured'
  const schoolName = billingSchool?.name || school?.name || 'Your school'
  return <div className="tenant-subscription">
    <section className="subscription-overview"><div><p className="eyebrow blue-eyebrow">SCHOOL PLAN & BILLING</p><h2>{schoolName} subscription</h2></div><div className="subscription-status"><small>SUBSCRIPTION STATUS</small><b className={`status-${status.replaceAll(' ', '-')}`}>{status.replaceAll('_', ' ')}</b><span>{subscription?.ends_at ? `Ends ${new Date(subscription.ends_at).toLocaleDateString()}` : 'No end date recorded'}</span></div></section>
    {!supabase && <div className="subscription-notice">Subscription data is unavailable until Supabase is configured.</div>}
    <section className="subscription-current"><div><small>CURRENT PLAN</small><h3>{subscription?.plan || school?.subscription_plan || 'No plan selected'}</h3></div><div><small>REQUEST STATUS</small><b>{subscription?.request_status || 'Not set'}</b></div>{subscription?.requested_plan && <p className="requested-plan">Requested: <b>{subscription.requested_plan}</b> · waiting for platform review</p>}{subscription?.monthly_amount && <p className="requested-plan">Monthly billing: <b>{currencyCode} {Number(subscription.monthly_amount).toLocaleString()}</b> · {subscription.billing_email}</p>}{subscription?.payment_failed_at && <p className="requested-plan">Last renewal failed: <b>{new Date(subscription.payment_failed_at).toLocaleString()}</b>. Workspace access is suspended until payment succeeds.</p>}</section>
    <div className="subscription-heading"><div><p className="eyebrow blue-eyebrow">AVAILABLE PLANS</p><h3>Choose a plan</h3></div><p>Monthly card renewal is managed by Flutterwave. Workspace access is suspended as soon as a renewal fails.</p></div>
    <section className="subscription-plans">{plans.map(([name, description]) => { const price = priceFor(name); const recurring = subscription?.status === 'active' && Boolean(subscription?.monthly_recurring); const isCurrent = subscription?.plan === name && recurring; return <article className={subscription?.plan === name ? 'subscription-plan current' : 'subscription-plan'} key={name}><span>{isCurrent ? 'ACTIVE MONTHLY PLAN' : 'MONTHLY SCHOOL PLAN'}</span><h3>{name}</h3><p>{description}</p><p className="subscription-monthly-price">{price ? `${currencyCode} ${Number(price.monthly_amount).toLocaleString()} / month` : `Monthly price not configured for ${currencyCode}`}</p><button type="button" className="button blue-button" disabled={saving || !price || recurring} onClick={() => void startMonthlySubscription(name)}>{recurring ? 'Monthly subscription active' : saving ? 'Opening secure checkout…' : `Subscribe monthly · ${currencyCode} ${price ? Number(price.monthly_amount).toLocaleString() : '—'}`}</button>{subscription?.requested_plan === name && <small>Plan request is awaiting platform review.</small>}</article> })}</section>
    <section className="subscription-billing-history"><h3>Recent subscription payments</h3>{attempts.length ? <div>{attempts.map(attempt => <article key={attempt.tx_ref}><span>{attempt.plan}</span><span>{attempt.currency_code} {Number(attempt.amount).toLocaleString()}</span><b className={`status-pill status-${attempt.status}`}>{attempt.status}</b><time>{new Date(attempt.created_at).toLocaleDateString()}</time></article>)}</div> : <p>No subscription payments yet.</p>}</section>
  </div>
}
