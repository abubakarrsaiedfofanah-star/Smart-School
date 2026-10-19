import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatters'
import { hasSchoolPermission } from '../lib/schoolRoles'
import FinanceSalaryPayouts from '../components/FinanceSalaryPayouts'

const localDateValue = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const blankExpense = { title: '', category: '', vendor: '', amount: '', incurred_on: localDateValue(), receipt_reference: '', notes: '' }
const blankRecon = { provider: '', provider_reference: '', amount: '', transaction_at: '', payment_id: '', note: '', status: 'unmatched' }

export default function FinanceOperations({ portalMode = false }) {
  const { profile, school, staffRoles, demo } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const validSections = ['Dashboard', 'Collections', 'Expenses', 'Reconciliation', 'Salary payments']
  const requestedSection = validSections.includes(searchParams.get('module')) ? searchParams.get('module') : portalMode ? 'Dashboard' : 'Expenses'
  const [section, setSection] = useState(requestedSection)
  const [expenses, setExpenses] = useState([])
  const [reconciliations, setReconciliations] = useState([])
  const [reconMatches, setReconMatches] = useState({})
  const [payments, setPayments] = useState([])
  const [expense, setExpense] = useState(blankExpense)
  const [recon, setRecon] = useState(blankRecon)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const currency = school?.currency_code || 'KES'
  const canManageExpenses = hasSchoolPermission(profile?.role, staffRoles, 'school.expenses.manage')
  const canReconcile = hasSchoolPermission(profile?.role, staffRoles, 'school.finance.reconcile')
  const canApprove = profile?.role === 'school_admin' || staffRoles.includes('principal')
  const canPayExpenses = profile?.role === 'school_admin' || staffRoles.includes('finance_officer')
  const canPaySalaries = profile?.role === 'school_admin' || staffRoles.includes('finance_officer')

  useEffect(() => { setSection(requestedSection) }, [requestedSection])
  const selectSection = next => { setSection(next); setSearchParams({ module: next }) }

  const load = useCallback(async () => {
    if (demo) {
      setLoadError('')
      setExpenses([
        { id: 'demo-expense-1', incurred_on: '2026-10-02', title: 'Science lab supplies', category: 'Learning materials', vendor: 'Sample School Supplies', amount: 24500, status: 'approved', receipt_reference: 'DEMO-EXP-001' },
        { id: 'demo-expense-2', incurred_on: '2026-10-08', title: 'Classroom repairs', category: 'Maintenance', vendor: 'Sample Repairs', amount: 12000, status: 'recorded', receipt_reference: 'DEMO-EXP-002' }
      ])
      setReconciliations([
        { id: 'demo-recon-1', provider: 'Mobile money', provider_reference: 'DEMO-TXN-1042', transaction_at: '2026-10-16T09:30:00Z', amount: 18000, status: 'unmatched', payment_id: null, note: 'Sample fee payment' },
        { id: 'demo-recon-2', provider: 'Bank transfer', provider_reference: 'DEMO-TXN-1031', transaction_at: '2026-10-15T11:00:00Z', amount: 25000, status: 'matched', payment_id: 'demo-payment-1', note: 'Sample reconciled payment' }
      ])
      setPayments([
        { id: 'demo-payment-1', reference: 'DEMO-FEE-031', amount: 25000, status: 'paid', paid_at: '2026-10-15T11:00:00Z' },
        { id: 'demo-payment-2', reference: 'DEMO-FEE-032', amount: 11000, status: 'pending', paid_at: null }
      ])
      setLoading(false)
      return
    }
    if (!profile?.school_id || !supabase) {
      setExpenses([])
      setReconciliations([])
      setPayments([])
      setLoadError('Connect this school to Supabase to load finance records.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    const expenseAccess = canManageExpenses
    const reconAccess = canReconcile
    try {
      const [expenseResult, reconResult, paymentResult] = await Promise.all([
        expenseAccess ? supabase.from('school_expenses').select('*').eq('school_id', profile.school_id).order('incurred_on', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        reconAccess ? supabase.from('payment_reconciliation_records').select('*').eq('school_id', profile.school_id).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        reconAccess ? supabase.from('payments').select('id,reference,amount,status,paid_at').eq('school_id', profile.school_id).order('paid_at', { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null })
      ])
      const error = expenseResult.error || reconResult.error || paymentResult.error
      if (error) throw error
      setExpenses(expenseResult.data || [])
      setReconciliations(reconResult.data || [])
      setPayments(paymentResult.data || [])
    } catch (error) {
      setExpenses([])
      setReconciliations([])
      setPayments([])
      setLoadError(error?.message || 'Could not load finance records. Check the connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [profile?.id, profile?.role, profile?.school_id, canManageExpenses, canReconcile, demo])

  useEffect(() => { load() }, [load])

  async function addExpense(event) {
    event.preventDefault()
    if (demo) { toast('Demo portal is read only. No financial records were changed.'); return }
    if (!supabase || !profile?.school_id) { toast.error('Connect this school to Supabase before recording an expense.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('school_expenses').insert({
        ...expense, school_id: profile.school_id, title: expense.title.trim(), category: expense.category.trim(),
        amount: Number(expense.amount), currency_code: currency, vendor: expense.vendor.trim() || null,
        receipt_reference: expense.receipt_reference.trim() || null, notes: expense.notes.trim() || null,
        created_by: profile.id
      })
      if (error) throw error
      toast.success('Expense recorded')
      setExpense(blankExpense)
      await load()
    } catch (error) {
      toast.error(error?.message || 'Could not record expense. Check the connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function setExpenseStatus(row, status) {
    if (demo) { toast('Demo portal is read only. No financial records were changed.'); return }
    if (!supabase || !profile?.school_id) { toast.error('Connect this school to Supabase before updating an expense.'); return }
    // The database records approval identity and payment time in its trigger.
    // A payment update must preserve the principal's original approval evidence.
    const patch = { status }
    try {
      const { data, error } = await supabase.from('school_expenses').update(patch).eq('id', row.id).eq('school_id', profile.school_id).select('id').maybeSingle()
      if (error) throw error
      if (!data) { toast.error('The expense was not updated. It may have changed or your access may have been removed.'); return }
      toast.success(`Expense marked ${status}`)
      await load()
    } catch (error) {
      toast.error(error?.message || 'Could not update expense. Check the connection and try again.')
    }
  }

  async function addReconciliation(event) {
    event.preventDefault()
    if (demo) { toast('Demo portal is read only. No financial records were changed.'); return }
    if (!supabase || !profile?.school_id) { toast.error('Connect this school to Supabase before adding a transaction.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('payment_reconciliation_records').insert({
        ...recon, school_id: profile.school_id, amount: Number(recon.amount), currency_code: currency,
        provider: recon.provider.trim(), provider_reference: recon.provider_reference.trim(),
        transaction_at: recon.transaction_at ? new Date(recon.transaction_at).toISOString() : null, payment_id: recon.payment_id || null,
        recorded_by: profile.id, reviewed_by: recon.status === 'reviewed' || recon.status === 'matched' ? profile.id : null,
        reviewed_at: recon.status === 'reviewed' || recon.status === 'matched' ? new Date().toISOString() : null
      })
      if (error) throw error
      toast.success('Transaction added for reconciliation')
      setRecon(blankRecon)
      await load()
    } catch (error) {
      toast.error(error?.message || 'Could not add transaction. Check the connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function updateRecon(row, status, selectedPaymentId = reconMatches[row.id] || row.payment_id) {
    if (demo) { toast('Demo portal is read only. No financial records were changed.'); return }
    if (!supabase || !profile?.school_id) { toast.error('Connect this school to Supabase before updating reconciliation.'); return }
    const paymentId = status === 'matched' ? selectedPaymentId : null
    if (status === 'matched' && !paymentId) { toast.error('Edit the transaction and select a school payment to match it'); return }
    try {
      const { data, error } = await supabase.from('payment_reconciliation_records').update({ status, payment_id: paymentId, reviewed_by: profile.id, reviewed_at: new Date().toISOString() }).eq('id', row.id).eq('school_id', profile.school_id).select('id').maybeSingle()
      if (error) throw error
      if (!data) { toast.error('The transaction was not updated. It may have changed or your access may have been removed.'); return }
      toast.success(status === 'matched' ? 'Payment matched' : 'Transaction reviewed')
      await load()
    } catch (error) {
      toast.error(error?.message || 'Could not update reconciliation. Check the connection and try again.')
    }
  }

  const totalExpenses = expenses.filter(row => row.status !== 'void').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const fmt = amount => formatCurrency(amount, currency)
  const Page = portalMode ? 'div' : 'main'
  return <Page className={`finance-ops-page ${portalMode ? 'finance-ops-embedded' : ''} ${demo ? 'finance-demo' : ''}`}>
    <style>{`.finance-ops-page{max-width:1200px;margin:auto;padding:36px 24px;color:var(--ink)}.finance-ops-page.finance-ops-embedded{max-width:1200px;padding:0}.finance-ops-head{margin-bottom:22px}.finance-ops-head h1{margin:4px 0}.finance-ops-head p{color:var(--muted);margin:0}.finance-ops-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr));gap:12px;margin:18px 0}.finance-ops-summary article{min-width:0;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface,white)}.finance-ops-summary span{display:block;color:var(--muted);font-size:.85rem}.finance-ops-tabs{display:flex;gap:8px;margin:20px 0;flex-wrap:wrap}.finance-ops-tabs button{min-height:42px;padding:10px 14px;border:1px solid var(--line);border-radius:9px;background:var(--surface,white);color:var(--ink);cursor:pointer}.finance-ops-tabs button[aria-pressed="true"]{background:var(--blue,#1769d2);color:white}.finance-ops-grid{display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr);gap:18px;align-items:start}.finance-ops-card{min-width:0;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface,white)}.finance-ops-card h2{font-size:1.05rem;margin:0 0 14px}.finance-ops-form input,.finance-ops-form select,.finance-ops-form textarea{width:100%;min-width:0;box-sizing:border-box;padding:10px;margin:0 0 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}.finance-ops-form textarea{min-height:75px;resize:vertical}.finance-ops-table-wrap{max-width:100%;overflow:auto;-webkit-overflow-scrolling:touch}.finance-ops-table{width:100%;border-collapse:collapse;min-width:650px}.finance-ops-table th,.finance-ops-table td{text-align:left;padding:11px 9px;border-bottom:1px solid var(--line);font-size:.88rem}.finance-ops-table th{color:var(--muted)}.finance-ops-status{text-transform:capitalize;white-space:nowrap}.finance-ops-note{color:var(--muted);font-size:.84rem;margin:0 0 14px}.finance-ops-empty{padding:25px;text-align:center;color:var(--muted)}@media(max-width:900px){.finance-ops-grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:520px){.finance-ops-page{padding:18px 12px}.finance-ops-head h1{font-size:1.55rem}.finance-ops-card{padding:14px}.finance-ops-table th,.finance-ops-table td{padding:9px 7px;font-size:.82rem}}`}</style>
    <style>{`.finance-demo .finance-ops-grid{grid-template-columns:minmax(0,1fr)}.finance-demo .finance-ops-form,.finance-demo .finance-ops-table button{display:none}`}</style>
    {demo && <div className="dashboard-data-note" role="status">Finance portal demo · sample records are read only and are not school financial data.</div>}
    <header className="finance-ops-head"><p className="eyebrow">{school?.name || 'School workspace'}</p><h1>{section === 'Dashboard' ? 'Finance overview' : section === 'Collections' ? 'Fee collections' : section === 'Expenses' ? 'Expense management' : section === 'Salary payments' ? 'Salary payments' : 'Payment reconciliation'}</h1><p>{section === 'Salary payments' ? 'Record approved salary transfers.' : 'Expenses, collections and reconciliation.'}</p></header>
    {loadError && <div className="finance-ops-card" role="alert"><p className="finance-ops-note">{loadError}</p><button type="button" className="button outline-button" onClick={() => void load()} disabled={loading}>{loading ? 'Retrying…' : 'Retry connection'}</button></div>}
    {section !== 'Salary payments' && (canManageExpenses || canReconcile) ? <div className="finance-ops-summary"><article><span>Recorded expenses</span><strong>{fmt(totalExpenses)}</strong></article><article><span>Transactions to review</span><strong>{reconciliations.filter(row => row.status === 'unmatched').length}</strong></article><article><span>Matched transactions</span><strong>{reconciliations.filter(row => row.status === 'matched').length}</strong></article><article><span>Recent collections · paid</span><strong>{fmt(payments.filter(row => row.status === 'paid').reduce((sum, row) => sum + Number(row.amount || 0), 0))}</strong></article></div> : null}
    {!portalMode && <div className="finance-ops-tabs"><button aria-pressed={section === 'Expenses'} onClick={() => selectSection('Expenses')}>Expenses</button><button aria-pressed={section === 'Reconciliation'} onClick={() => selectSection('Reconciliation')}>Payment reconciliation</button></div>}
    {section === 'Collections' && portalMode && <section className="finance-ops-card"><h2>Recent school payments</h2><p className="finance-ops-note">Recent payment records · view only.</p>{loading ? <div className="finance-ops-empty">Loading payments…</div> : loadError ? <div className="finance-ops-empty">Payment records are unavailable while the connection has an error.</div> : payments.length === 0 ? <div className="finance-ops-empty">No payment records found.</div> : <div className="finance-ops-table-wrap"><table className="finance-ops-table"><thead><tr><th>Payment reference</th><th>Paid on</th><th>Amount</th><th>Status</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id}><td>{payment.reference || payment.id.slice(0, 8)}</td><td>{payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '—'}</td><td>{fmt(payment.amount)}</td><td className="finance-ops-status">{payment.status}</td></tr>)}</tbody></table></div>}</section>}
    <div style={{ display: section === 'Salary payments' || (['Dashboard', 'Collections'].includes(section) && portalMode) ? 'none' : undefined }}>
    {!canManageExpenses && !canReconcile ? <section className="finance-ops-card finance-ops-empty">Finance officer access required.</section> : section === 'Expenses' && !canManageExpenses ? <section className="finance-ops-card finance-ops-empty">Expense access required.</section> : section === 'Reconciliation' && !canReconcile ? <section className="finance-ops-card finance-ops-empty">Reconciliation access required.</section> : section === 'Expenses' ? <div className="finance-ops-grid"><form className="finance-ops-card finance-ops-form" onSubmit={addExpense}><h2>Record expense</h2><input required maxLength="160" placeholder="Description" value={expense.title} onChange={e => setExpense({ ...expense, title: e.target.value })} /><input required maxLength="80" placeholder="Category" value={expense.category} onChange={e => setExpense({ ...expense, category: e.target.value })} /><input placeholder="Vendor / payee" value={expense.vendor} onChange={e => setExpense({ ...expense, vendor: e.target.value })} /><input required type="number" min="0.01" step="0.01" placeholder="Amount" value={expense.amount} onChange={e => setExpense({ ...expense, amount: e.target.value })} /><input required type="date" value={expense.incurred_on} onChange={e => setExpense({ ...expense, incurred_on: e.target.value })} /><input placeholder="Receipt or voucher reference" value={expense.receipt_reference} onChange={e => setExpense({ ...expense, receipt_reference: e.target.value })} /><textarea placeholder="Notes" value={expense.notes} onChange={e => setExpense({ ...expense, notes: e.target.value })} /><button className="button blue-button" disabled={saving}>{saving ? 'Saving…' : 'Record expense'}</button></form><section className="finance-ops-card"><h2>Expense register</h2>{loading ? <div className="finance-ops-empty">Loading…</div> : loadError ? <div className="finance-ops-empty">Expense records are unavailable while the connection has an error.</div> : expenses.length === 0 ? <div className="finance-ops-empty">No expenses recorded.</div> : <div className="finance-ops-table-wrap"><table className="finance-ops-table"><thead><tr><th>Date</th><th>Description</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{expenses.map(row => <tr key={row.id}><td>{row.incurred_on}</td><td><strong>{row.title}</strong><div className="finance-ops-note">{row.category} · {row.receipt_reference || 'No receipt ref'}</div></td><td>{row.vendor || '—'}</td><td>{fmt(row.amount)}</td><td className="finance-ops-status">{row.status}</td><td>{row.status === 'recorded' && canApprove && <button className="button outline-button" onClick={() => setExpenseStatus(row, 'approved')}>Approve</button>}{row.status === 'approved' && canPayExpenses && <button className="button outline-button" onClick={() => setExpenseStatus(row, 'paid')}>Mark paid</button>}</td></tr>)}</tbody></table></div>}</section></div> : <><p className="finance-ops-note">Match bank or mobile money transactions to school payments.</p><div className="finance-ops-grid"><form className="finance-ops-card finance-ops-form" onSubmit={addReconciliation}><h2>Add statement transaction</h2><input required placeholder="Provider (bank / mobile money)" value={recon.provider} onChange={e => setRecon({ ...recon, provider: e.target.value })} /><input required placeholder="Provider transaction reference" value={recon.provider_reference} onChange={e => setRecon({ ...recon, provider_reference: e.target.value })} /><input required type="number" min="0.01" step="0.01" placeholder="Amount" value={recon.amount} onChange={e => setRecon({ ...recon, amount: e.target.value })} /><input type="datetime-local" value={recon.transaction_at} onChange={e => setRecon({ ...recon, transaction_at: e.target.value })} /><select value={recon.payment_id} onChange={e => setRecon({ ...recon, payment_id: e.target.value, status: e.target.value ? 'matched' : 'unmatched' })}><option value="">Leave unmatched for review</option>{payments.map(payment => <option key={payment.id} value={payment.id}>{payment.reference || payment.id.slice(0, 8)} · {fmt(payment.amount)} · {payment.status}</option>)}</select><textarea placeholder="Reconciliation note" value={recon.note} onChange={e => setRecon({ ...recon, note: e.target.value })} /><button className="button blue-button" disabled={saving}>{saving ? 'Saving…' : 'Add transaction'}</button></form><section className="finance-ops-card"><h2>Statement transactions</h2>{loading ? <div className="finance-ops-empty">Loading…</div> : loadError ? <div className="finance-ops-empty">Reconciliation records are unavailable while the connection has an error.</div> : reconciliations.length === 0 ? <div className="finance-ops-empty">No statement transactions added.</div> : <div className="finance-ops-table-wrap"><table className="finance-ops-table"><thead><tr><th>Provider / reference</th><th>Date</th><th>Amount</th><th>Payment match</th><th>Status</th><th></th></tr></thead><tbody>{reconciliations.map(row => <tr key={row.id}><td>{row.provider}<div className="finance-ops-note">{row.provider_reference}</div></td><td>{row.transaction_at ? new Date(row.transaction_at).toLocaleString() : '—'}</td><td>{fmt(row.amount)}</td><td>{row.status === 'unmatched' ? <select aria-label="Match school payment" value={reconMatches[row.id] || ''} onChange={e => setReconMatches(current => ({ ...current, [row.id]: e.target.value }))}><option value="">Select payment</option>{payments.filter(payment => Number(payment.amount) === Number(row.amount)).map(payment => <option key={payment.id} value={payment.id}>{payment.reference || payment.id.slice(0, 8)} · {fmt(payment.amount)} · {payment.status}</option>)}</select> : payments.find(payment => payment.id === row.payment_id)?.reference || 'Unmatched'}</td><td className="finance-ops-status">{row.status}</td><td>{row.status === 'unmatched' && <><button className="button outline-button" onClick={() => updateRecon(row, 'matched')}>Match</button><button className="button outline-button" onClick={() => updateRecon(row, 'reviewed', null)}>Mark reviewed</button></>}</td></tr>)}</tbody></table></div>}</section></div></>}
    </div>
    {section === 'Salary payments' && <FinanceSalaryPayouts />}
  </Page>
}
