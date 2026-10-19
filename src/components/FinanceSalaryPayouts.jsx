import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatters'

const emptyForm = { provider: 'bank', reference: '' }

export default function FinanceSalaryPayouts() {
  const { profile, school, staffRoles, demo } = useAuth()
  const [items, setItems] = useState([])
  const [payments, setPayments] = useState([])
  const [actorNames, setActorNames] = useState({})
  const [payoutAccount, setPayoutAccount] = useState({ currency_code: 'KES', bank_name: '', bank_account_name: '', bank_account_number: '', bank_routing_code: '', mobile_money_provider: '', mobile_money_number: '' })
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const canPay = profile?.role === 'school_admin' || staffRoles.includes('finance_officer')
  const canConfigurePayout = profile?.role === 'school_admin' || staffRoles.includes('principal')
  const canView = canPay || canConfigurePayout

  const load = useCallback(async () => {
    if (demo) {
      setItems([])
      setPayments([])
      setActorNames({})
      setPayoutAccount({ currency_code: school?.currency_code || '', bank_name: '', bank_account_name: '', bank_account_number: '', bank_routing_code: '', mobile_money_provider: '', mobile_money_number: '' })
      setMessage('This demo account has no connected school records.')
      setLoading(false)
      return
    }
    if (!supabase || !profile?.school_id) { setMessage('Connect this school to load approved salary payouts.'); setLoading(false); return }

    setLoading(true)
    setMessage('')
    const [itemResult, paymentResult, accountResult] = await Promise.all([
      supabase.rpc('list_salary_payout_items'),
      supabase.from('payment_transactions')
        .select('id,payroll_item_id,provider,transaction_reference,amount,status,initiated_by,confirmed_by,confirmed_at,created_at')
        .eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(1000),
      supabase.from('school_payroll_accounts').select('*').eq('school_id', profile.school_id).maybeSingle()
    ])
    if (itemResult.error || paymentResult.error || accountResult.error) {
      setItems([]); setPayments([])
      setMessage((itemResult.error || paymentResult.error || accountResult.error).message || 'Could not load salary payout records.')
      setLoading(false)
      return
    }
    const nextItems = (itemResult.data || []).map(item => ({
      id: item.id,
      net_pay: item.net_pay,
      payroll_runs: { pay_period: item.pay_period, status: item.payroll_status, currency_code: item.currency_code },
      hr_employees: { full_name: item.employee_name, staff_number: item.staff_number }
    }))
    const nextPayments = paymentResult.data || []
    if (accountResult.data) setPayoutAccount(accountResult.data)
    setItems(nextItems)
    setPayments(nextPayments)
    const actorIds = [...new Set(nextPayments.flatMap(row => [row.initiated_by, row.confirmed_by]).filter(Boolean))]
    if (actorIds.length) {
      const { data: actors } = await supabase.from('profiles').select('id,full_name,email').eq('school_id', profile.school_id).in('id', actorIds)
      setActorNames(Object.fromEntries((actors || []).map(actor => [actor.id, actor.full_name || actor.email || actor.id])))
    } else setActorNames({})
    setLoading(false)
  }, [demo, profile?.school_id])

  useEffect(() => { void load() }, [load])

  const latestPaymentByItem = useMemo(() => {
    const latest = new Map()
    for (const payment of payments) if (!latest.has(payment.payroll_item_id)) latest.set(payment.payroll_item_id, payment)
    return latest
  }, [payments])

  async function recordPayout(event) {
    event.preventDefault()
    if (!selectedItem || demo) return
    setBusy(true); setMessage('')
    const { error } = await supabase.rpc('record_salary_payment', {
      target_item: selectedItem.id,
      provider_value: form.provider,
      reference_value: form.reference,
      amount_value: Number(selectedItem.net_pay)
    })
    setBusy(false)
    if (error) { setMessage(error.message || 'Could not record this salary payout.'); return }
    setSelectedItem(null); setForm(emptyForm)
    await load()
    setMessage('Payout recorded as pending. Confirm it after checking the provider settlement.')
  }

  async function resolvePayout(payment, decision) {
    if (demo) return
    setBusy(true); setMessage('')
    const { error } = await supabase.rpc('confirm_salary_payment', { target_payment: payment.id, decision_value: decision })
    setBusy(false)
    if (error) { setMessage(error.message || 'Could not update this payout.'); return }
    await load()
    setMessage(decision === 'paid' ? 'Payment confirmed and your account recorded as confirmer.' : 'Payout marked failed; finance can record a corrected transfer.')
  }

  async function savePayoutAccount(event) {
    event.preventDefault()
    setBusy(true); setMessage('')
    const { error } = await supabase.from('school_payroll_accounts').upsert({
      ...payoutAccount, school_id: profile.school_id, currency_code: school?.currency_code || 'KES',
      updated_by: profile.id, updated_at: new Date().toISOString()
    }, { onConflict: 'school_id' })
    setBusy(false)
    if (error) { setMessage(error.message || 'Could not save the salary payout destination.'); return }
    await load()
    setMessage('Approved payout destination saved. Provider credentials are not stored here.')
  }

  const amountText = item => formatCurrency(item.net_pay, item.payroll_runs?.currency_code || school?.currency_code || 'KES')
  const actorName = id => actorNames[id] || (id ? `Account ${id.slice(0, 8)}` : '—')

  if (!canView) return <section className="finance-ops-card finance-ops-empty">Salary payouts are limited to the finance officer and principal. Ask your school administrator to assign the relevant responsibility.</section>

  return <section className="finance-ops-card finance-salary-payouts">
    <h2>Salary payouts</h2>
    <p className="finance-ops-note">HR prepares the payroll. The principal approves it. The finance officer transfers the approved net pay through the school’s bank or mobile-money provider, then records and confirms the settlement here. SmartSchool records the transfer; it does not send money.</p>
    {message && <p className="finance-salary-message" role="status">{message}</p>}
    <article className="finance-ops-card finance-payout-destination"><h3>Approved salary payout destination</h3>{canConfigurePayout ? <form className="finance-ops-form" onSubmit={savePayoutAccount}><input placeholder="Bank name" value={payoutAccount.bank_name || ''} onChange={event => setPayoutAccount(current => ({ ...current, bank_name: event.target.value }))} /><input placeholder="Account name" value={payoutAccount.bank_account_name || ''} onChange={event => setPayoutAccount(current => ({ ...current, bank_account_name: event.target.value }))} /><input placeholder="Bank account number" value={payoutAccount.bank_account_number || ''} onChange={event => setPayoutAccount(current => ({ ...current, bank_account_number: event.target.value }))} /><input placeholder="Bank routing / branch code" value={payoutAccount.bank_routing_code || ''} onChange={event => setPayoutAccount(current => ({ ...current, bank_routing_code: event.target.value }))} /><input placeholder="Mobile-money provider" value={payoutAccount.mobile_money_provider || ''} onChange={event => setPayoutAccount(current => ({ ...current, mobile_money_provider: event.target.value }))} /><input placeholder="Mobile-money payout number" value={payoutAccount.mobile_money_number || ''} onChange={event => setPayoutAccount(current => ({ ...current, mobile_money_number: event.target.value }))} /><button className="button blue-button" disabled={busy}>{busy ? 'Saving…' : 'Save payout destination'}</button></form> : (payoutAccount.bank_name || payoutAccount.mobile_money_provider || payoutAccount.bank_account_number || payoutAccount.mobile_money_number) ? <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12, margin: 0 }}>{[['Currency', payoutAccount.currency_code], ['Bank', payoutAccount.bank_name], ['Account name', payoutAccount.bank_account_name], ['Account number', payoutAccount.bank_account_number], ['Routing / branch code', payoutAccount.bank_routing_code], ['Mobile-money provider', payoutAccount.mobile_money_provider], ['Mobile-money number', payoutAccount.mobile_money_number]].filter(([, value]) => value).map(([label, value]) => <div key={label} style={{ minWidth: 0, padding: 12, border: '1px solid var(--line)', borderRadius: 9 }}><dt style={{ color: 'var(--muted)', fontSize: '.78rem' }}>{label}</dt><dd style={{ margin: '5px 0 0', color: 'var(--ink)', overflowWrap: 'anywhere', fontWeight: 650 }}>{value}</dd></div>)}</dl> : <p className="finance-ops-note">The principal has not configured a payout destination yet.</p>}</article>
    {loading ? <div className="finance-ops-empty" role="status">Loading approved payroll…</div> : !items.length ? <div className="finance-ops-empty">No approved payroll items are waiting for payment.</div> : <div className="finance-ops-table-wrap"><table className="finance-ops-table"><thead><tr><th>Staff member</th><th>Period</th><th>Net pay</th><th>Payment status</th><th>Recorded by</th><th>Confirmed by</th><th>Action</th></tr></thead><tbody>{items.map(item => {
      const payment = latestPaymentByItem.get(item.id)
      const canStart = ['approved','paying'].includes(item.payroll_runs?.status) && (!payment || ['failed','reversed'].includes(payment.status))
      return <tr key={item.id}>
        <td><strong>{item.hr_employees?.full_name || 'Staff member'}</strong><div className="finance-ops-note">{item.hr_employees?.staff_number || ''}</div></td>
        <td>{item.payroll_runs?.pay_period}</td><td>{amountText(item)}</td>
        <td className="finance-ops-status">{payment?.status || 'Not paid'}</td>
        <td>{actorName(payment?.initiated_by)}</td><td>{actorName(payment?.confirmed_by)}</td>
        <td>{canPay && (payment?.status === 'pending' || payment?.status === 'processing') ? <div className="finance-salary-actions"><button type="button" className="button blue-button" disabled={busy || demo} onClick={() => void resolvePayout(payment, 'paid')}>Confirm paid</button><button type="button" className="button outline-button" disabled={busy || demo} onClick={() => void resolvePayout(payment, 'failed')}>Mark failed</button></div> : canPay && canStart ? <button type="button" className="button outline-button" disabled={demo} onClick={() => { setSelectedItem(item); setForm(emptyForm) }}>Record payout</button> : payment?.status === 'paid' ? <span>{payment.provider} · {payment.transaction_reference || 'No reference'}</span> : '—'}</td>
      </tr>
    })}</tbody></table></div>}
    {selectedItem && canPay && <form className="finance-ops-form finance-salary-form" onSubmit={recordPayout}>
      <h3>Record completed transfer · {selectedItem.hr_employees?.full_name}</h3>
      <p className="finance-ops-note">Transfer {amountText(selectedItem)} outside SmartSchool first. Enter the provider reference below; confirmation records the account that verified settlement.</p>
      <select value={form.provider} onChange={event => setForm(current => ({ ...current, provider: event.target.value }))}><option value="bank">Bank</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="other">Other</option></select>
      <input value={amountText(selectedItem)} aria-label="Approved net pay" readOnly />
      <input required={['bank','mobile_money'].includes(form.provider)} maxLength={160} placeholder="Transaction reference" value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} />
      <button className="button blue-button" disabled={busy}>{busy ? 'Recording…' : 'Record payout for confirmation'}</button>
      <button className="button outline-button" type="button" disabled={busy} onClick={() => setSelectedItem(null)}>Cancel</button>
    </form>}
  </section>
}
