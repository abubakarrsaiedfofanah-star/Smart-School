import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const plans = [
  ['Starter', 'Core school routines and learner records.'],
  ['Professional', 'Broader academic and school operations.'],
  ['Enterprise', 'A larger school setup with platform review.'],
]

export default function SchoolSubscription() {
  const { profile, school } = useAuth()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadSubscription = useCallback(async () => {
    if (!supabase || !profile?.school_id) { setLoading(false); return }
    const { data, error } = await supabase.from('subscriptions').select('*').eq('school_id', profile.school_id).maybeSingle()
    if (error) toast.error(`Could not load subscription: ${error.message}`)
    setSubscription(data || null)
    setLoading(false)
  }, [profile?.school_id])

  useEffect(() => { loadSubscription() }, [loadSubscription])

  async function requestPlan(plan) {
    if (!supabase) return toast.error('Connect Supabase to manage this school subscription.')
    setSaving(true)
    const { error } = await supabase.rpc('request_school_plan', { p_plan: plan })
    if (error) toast.error(error.message)
    else { toast.success(`${plan} plan requested for platform review.`); await loadSubscription() }
    setSaving(false)
  }

  if (loading) return <div className="portal-loading"><div className="spinner" /></div>
  const status = subscription?.status || 'not configured'
  return <div className="tenant-subscription">
    <section className="subscription-overview"><div><p className="eyebrow blue-eyebrow">SCHOOL PLAN & BILLING</p><h2>{school?.name || 'Your school'} subscription</h2></div><div className="subscription-status"><small>SUBSCRIPTION STATUS</small><b className={`status-${status.replaceAll(' ', '-')}`}>{status.replaceAll('_', ' ')}</b><span>{subscription?.ends_at ? `Ends ${new Date(subscription.ends_at).toLocaleDateString()}` : 'No end date recorded'}</span></div></section>
    {!supabase && <div className="subscription-notice">Subscription data is unavailable until Supabase is configured.</div>}
    <section className="subscription-current"><div><small>CURRENT PLAN</small><h3>{subscription?.plan || school?.subscription_plan || 'No plan selected'}</h3></div><div><small>REQUEST STATUS</small><b>{subscription?.request_status || 'Not set'}</b></div>{subscription?.requested_plan && <p className="requested-plan">Requested: <b>{subscription.requested_plan}</b> · waiting for platform review</p>}</section>
    <div className="subscription-heading"><div><p className="eyebrow blue-eyebrow">AVAILABLE PLANS</p><h3>Choose a plan</h3></div><p>Plans require platform approval. No online checkout.</p></div>
    <section className="subscription-plans">{plans.map(([name, description]) => <article className={subscription?.plan === name ? 'subscription-plan current' : 'subscription-plan'} key={name}><span>{subscription?.plan === name ? 'CURRENT PLAN' : 'SCHOOL PLAN'}</span><h3>{name}</h3><p>{description}</p><button type="button" className="button blue-button" disabled={saving || subscription?.requested_plan === name} onClick={() => requestPlan(name)}>{subscription?.requested_plan === name ? 'Request sent' : subscription?.plan === name ? 'Request this plan' : `Request ${name}`}</button></article>)}</section>
  </div>
}
