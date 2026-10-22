import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

const views = ['Schools', 'School approvals', 'Subscriptions']
const date = value => value ? new Date(value).toLocaleDateString() : '—'

export default function PlatformManagement({ view = 'Schools' }) {
  const [schools, setSchools] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [planPrices, setPlanPrices] = useState([])
  const [priceForm, setPriceForm] = useState({ plan: 'Starter', currency: 'KES', amount: '', flutterwavePlanId: '' })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const [schoolResult, subscriptionResult, priceResult] = await Promise.all([
      supabase.from('schools').select('id,name,slug,email,admin_email,status,subscription_plan,logo_url,country_code,currency_code,created_at').order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('*'),
      supabase.from('subscription_plan_prices').select('*').order('currency_code').order('plan'),
    ])
    if (schoolResult.error) toast.error(`Could not load schools: ${schoolResult.error.message}`)
    if (subscriptionResult.error) toast.error(`Could not load subscriptions: ${subscriptionResult.error.message}`)
    if (priceResult.error) toast.error(`Could not load monthly prices: ${priceResult.error.message}`)
    setSchools(schoolResult.data || [])
    setSubscriptions(subscriptionResult.data || [])
    setPlanPrices(priceResult.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function setSchoolStatus(schoolId, status) {
    if (status === 'active') {
      const sub = subscriptionFor(schoolId)
      const currentlyEntitled = ['trial', 'active'].includes(sub?.status) && Boolean(sub?.ends_at) && new Date(sub.ends_at).getTime() > Date.now()
      if (!currentlyEntitled && sub?.request_status === 'trial_requested' && !sub?.trial_started_at) {
        await setSubscription(schoolId, sub.requested_plan || sub.plan || 'Starter', 'trial')
        return
      }
      if (!currentlyEntitled) {
        toast.error('Start a free trial or activate a plan first.')
        return
      }
    }
    setWorking(schoolId)
    const { error } = await supabase.rpc('platform_set_school_status', { p_school_id: schoolId, p_status: status })
    if (error) toast.error(error.message)
    else { toast.success(`School marked ${status}.`); await load() }
    setWorking('')
  }

  async function setSubscription(schoolId, plan, status) {
    setWorking(schoolId)
    const days = status === 'trial' ? 14 : null
    const endsAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null
    const { error } = await supabase.rpc('platform_set_subscription', { p_school_id: schoolId, p_plan: plan, p_status: status, p_ends_at: endsAt })
    if (error) toast.error(error.message)
    else { toast.success(status === 'trial' ? '14-day free trial started.' : `Subscription updated to ${status}.`); await load() }
    setWorking('')
  }

  async function savePlanPrice(event) {
    event.preventDefault()
    if (!supabase) return toast.error('Connect Supabase to manage monthly prices.')
    const currency = priceForm.currency.trim().toUpperCase()
    const amount = Number(priceForm.amount)
    const flutterwavePlanId = Number(priceForm.flutterwavePlanId)
    if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(flutterwavePlanId) || flutterwavePlanId <= 0) {
      return toast.error('Enter a three-letter currency, positive monthly amount and valid Flutterwave plan ID.')
    }
    setWorking('plan-price')
    const { error } = await supabase.rpc('platform_set_subscription_price', {
      p_plan: priceForm.plan, p_currency_code: currency,
      p_monthly_amount: amount, p_flutterwave_plan_id: flutterwavePlanId,
    })
    if (error) toast.error(error.message)
    else { toast.success(`${priceForm.plan} ${currency} monthly price saved.`); setPriceForm(current => ({ ...current, amount: '', flutterwavePlanId: '' })); await load() }
    setWorking('')
  }

  const activeView = views.includes(view) ? view : 'Schools'
  const pendingSchools = schools.filter(item => item.status === 'pending')
  const subscriptionFor = schoolId => subscriptions.find(item => item.school_id === schoolId)

  return <section className="platform-management">
    <div className="platform-management-heading"><div><p className="eyebrow blue-eyebrow">SMARTSCHOOL PLATFORM</p><h2>{activeView}</h2><p>Review each school workspace and manage its platform access.</p></div><button className="platform-refresh" type="button" onClick={load} disabled={loading}>↻ Refresh</button></div>
    <nav className="platform-tabs" aria-label="Platform administration">{views.map(item => <Link to={`/super-admin?module=${encodeURIComponent(item)}`} className={item === activeView ? 'active' : ''} key={item}>{item}{item === 'School approvals' && pendingSchools.length > 0 && <b>{pendingSchools.length}</b>}</Link>)}</nav>
    {!supabase ? <div className="platform-empty">Connect Supabase to load school and subscription records.</div> : loading ? <div className="portal-loading"><div className="spinner" /></div> : activeView === 'Subscriptions' ? <>
      <section className="platform-billing-prices"><div><p className="eyebrow blue-eyebrow">RECURRING BILLING</p><h3>Monthly plan prices</h3><p>Create monthly card plans in the Flutterwave dashboard first, then save each provider plan ID and price here.</p></div><form onSubmit={savePlanPrice}><label>Plan<select value={priceForm.plan} onChange={event => setPriceForm(current => ({ ...current, plan: event.target.value }))}>{['Starter','Professional','Enterprise'].map(plan => <option value={plan} key={plan}>{plan}</option>)}</select></label><label>Currency<input value={priceForm.currency} maxLength={3} onChange={event => setPriceForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="KES" /></label><label>Monthly amount<input type="number" min="0.01" step="0.01" required value={priceForm.amount} onChange={event => setPriceForm(current => ({ ...current, amount: event.target.value }))} /></label><label>Flutterwave plan ID<input type="number" min="1" step="1" required value={priceForm.flutterwavePlanId} onChange={event => setPriceForm(current => ({ ...current, flutterwavePlanId: event.target.value }))} /></label><button type="submit" disabled={working === 'plan-price'}>{working === 'plan-price' ? 'Saving…' : 'Save monthly price'}</button></form>{planPrices.length ? <div className="platform-billing-price-list">{planPrices.map(price => <article key={price.id}><b>{price.plan}</b><span>{price.currency_code} {Number(price.monthly_amount).toLocaleString()} / month</span><small>Flutterwave plan {price.flutterwave_plan_id}</small></article>)}</div> : <p className="platform-empty">Configure one monthly price and provider plan for each plan and currency you sell.</p>}</section>
      <div className="platform-record-list">{schools.map(school => { const sub = subscriptionFor(school.id); const plan = sub?.requested_plan || sub?.plan || school.subscription_plan || 'Starter'; return <article className="platform-record subscription-record" key={school.id}><div className="platform-record-school"><span className="platform-school-logo">{school.logo_url ? <img src={school.logo_url} alt="" /> : (school.name || 'S').slice(0, 1)}</span><div><h3>{school.name}</h3><p>{school.admin_email || school.email || 'No admin email'} · {school.slug} · {school.country_code || 'KE'} · {school.currency_code || 'KES'}</p></div></div><div className="platform-record-meta"><span>PLAN<b>{plan}{sub?.requested_plan ? ' · requested' : ''}</b></span><span>STATUS<b className={`status-pill status-${sub?.status || 'missing'}`}>{sub?.status || 'missing'}</b></span><span>REQUEST<b className={`status-pill ${sub?.request_status === 'trial_requested' ? 'status-pending' : ''}`}>{sub?.request_status === 'trial_requested' ? 'Trial requested' : sub?.request_status || '—'}</b></span><span>ENDS<b>{date(sub?.ends_at)}</b></span></div><div className="platform-record-actions"><button type="button" disabled={!sub || Boolean(sub?.trial_started_at) || working === school.id} onClick={() => setSubscription(school.id, plan, 'trial')}>{sub?.trial_started_at ? 'Trial used' : 'Start 14-day trial'}</button><button type="button" className="suspend" disabled={!sub || working === school.id} onClick={() => setSubscription(school.id, plan, 'suspended')}>Suspend</button></div></article> })}{!schools.length && <div className="platform-empty">No schools have registered yet.</div>}</div>
    </> : <>
      {activeView === 'School approvals' && <div className="platform-notice">New school registrations stay pending until you approve them. Subscription activation is managed separately.</div>}
      <div className="platform-record-list">{(activeView === 'School approvals' ? pendingSchools : schools).map(school => <article className="platform-record" key={school.id}><div className="platform-record-school"><span className="platform-school-logo">{school.logo_url ? <img src={school.logo_url} alt="" /> : (school.name || 'S').slice(0, 1)}</span><div><h3>{school.name}</h3><p>{school.admin_email || school.email || 'No admin email'} · {school.slug}</p></div></div><div className="platform-record-meta"><span>STATUS<b className={`status-pill status-${school.status}`}>{school.status}</b></span><span>PLAN<b>{school.subscription_plan || 'Starter'}</b></span><span>REGISTERED<b>{date(school.created_at)}</b></span></div><div className="platform-record-actions">{school.status !== 'active' && <button className="approve" type="button" disabled={working === school.id} onClick={() => setSchoolStatus(school.id, 'active')}>Approve school</button>}{school.status !== 'rejected' && <button type="button" disabled={working === school.id} onClick={() => setSchoolStatus(school.id, 'rejected')}>Reject</button>}{school.status !== 'suspended' && school.status === 'active' && <button className="suspend" type="button" disabled={working === school.id} onClick={() => setSchoolStatus(school.id, 'suspended')}>Suspend</button>}</div></article>)}{(activeView === 'School approvals' ? pendingSchools : schools).length === 0 && <div className="platform-empty">{activeView === 'School approvals' ? 'No school requests are waiting for review.' : 'No school workspaces have registered yet.'}</div>}</div>
    </>}
  </section>
}
