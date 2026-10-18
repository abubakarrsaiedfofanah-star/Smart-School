import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatters'
import { hasSchoolPermission } from '../lib/schoolRoles'

const localDateValue = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const blankExpense = { title: '', category: '', vendor: '', amount: '', incurred_on: localDateValue(), receipt_reference: '', notes: '' }
const blankRecon = { provider: '', provider_reference: '', amount: '', transaction_at: '', payment_id: '', note: '', status: 'unmatched' }

export default function FinanceOperations() {
  const { profile, school, staffRoles } = useAuth()
  const [section, setSection] = useState('Expenses')
  const [expenses, setExpenses] = useState([])
  const [reconciliations, setReconciliations] = useState([])
  const [reconMatches, setReconMatches] = useState({})
  const [payments, setPayments] = useState([])
  const [expense, setExpense] = useState(blankExpense)
  const [recon, setRecon] = useState(blankRecon)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const currency = school?.currency_code || 'KES'
  const canManageExpenses = hasSchoolPermission(profile?.role, staffRoles, 'school.expenses.manage')
  const canReconcile = hasSchoolPermission(profile?.role, staffRoles, 'school.finance.reconcile')
  const canApprove = profile?.role === 'school_admin' || staffRoles.includes('principal')

  const load = useCallback(async () => {
    if (!profile?.school_id || !supabase) return
    setLoading(true)
    const expenseAccess = canManageExpenses
    const reconAccess = canReconcile
    const [expenseResult, reconResult, paymentResult] = await Promise.all([
      expenseAccess ? supabase.from('school_expenses').select('*').eq('school_id', profile.school_id).order('incurred_on', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      reconAccess ? supabase.from('payment_reconciliation_records').select('*').eq('school_id', profile.school_id).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      reconAccess ? supabase.from('payments').select('id,reference,amount,status,paid_at').eq('school_id', profile.school_id).order('paid_at', { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null })
    ])
    if (expenseResult.error) toast.error(expenseResult.error.message || 'Could not load expenses')
    if (reconResult.error) toast.error(reconResult.error.message || 'Could not load reconciliation records')
    setExpenses(expenseResult.data || [])
    setReconciliations(reconResult.data || [])
    setPayments(paymentResult.data || [])
    setLoading(false)
  }, [profile?.id, profile?.role, profile?.school_id, canManageExpenses, canReconcile])

  useEffect(() => { load() }, [load])

  async function addExpense(event) {
    event.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('school_expenses').insert({
      ...expense, school_id: profile.school_id, title: expense.title.trim(), category: expense.category.trim(),
      amount: Number(expense.amount), currency_code: currency, vendor: expense.vendor.trim() || null,
      receipt_reference: expense.receipt_reference.trim() || null, notes: expense.notes.trim() || null,
      created_by: profile.id
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Could not record expense'); return }
    toast.success('Expense recorded')
    setExpense(blankExpense)
    load()
  }

  async function setExpenseStatus(row, status) {
    const patch = { status, updated_at: new Date().toISOString() }
    if (status === 'approved' || status === 'paid') { patch.approved_by = profile.id; patch.approved_at = new Date().toISOString() }
    if (status === 'paid') patch.paid_at = new Date().toISOString()
    const { error } = await supabase.from('school_expenses').update(patch).eq('id', row.id).eq('school_id', profile.school_id)
    if (error) { toast.error(error.message || 'Could not update expense'); return }
    toast.success(`Expense marked ${status}`)
    load()
  }

  async function addReconciliation(event) {
    event.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('payment_reconciliation_records').insert({
      ...recon, school_id: profile.school_id, amount: Number(recon.amount), currency_code: currency,
      provider: recon.provider.trim(), provider_reference: recon.provider_reference.trim(),
      transaction_at: recon.transaction_at ? new Date(recon.transaction_at).toISOString() : null, payment_id: recon.payment_id || null,
      recorded_by: profile.id, reviewed_by: recon.status === 'reviewed' || recon.status === 'matched' ? profile.id : null,
      reviewed_at: recon.status === 'reviewed' || recon.status === 'matched' ? new Date().toISOString() : null
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Could not add transaction'); return }
    toast.success('Transaction added for reconciliation')
    setRecon(blankRecon)
    load()
  }

  async function updateRecon(row, status, selectedPaymentId = reconMatches[row.id] || row.payment_id) {
    const paymentId = status === 'matched' ? selectedPaymentId : null
    if (status === 'matched' && !paymentId) { toast.error('Edit the transaction and select a school payment to match it'); return }
    const { error } = await supabase.from('payment_reconciliation_records').update({ status, payment_id: paymentId, reviewed_by: profile.id, reviewed_at: new Date().toISOString() }).eq('id', row.id).eq('school_id', profile.school_id)
    if (error) { toast.error(error.message || 'Could not update reconciliation'); return }
    toast.success(status === 'matched' ? 'Payment matched' : 'Transaction reviewed')
    load()
  }

  const totalExpenses = expenses.filter(row => row.status !== 'void').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const fmt = amount => formatCurrency(amount, currency)
  return <main className="finance-ops-page">
    <style>{`.finance-ops-page{max-width:1200px;margin:auto;padding:36px 24px;color:var(--ink)}.finance-ops-head{margin-bottom:22px}.finance-ops-head h1{margin:4px 0}.finance-ops-head p{color:var(--muted);margin:0}.finance-ops-summary{display:flex;gap:14px;margin:18px 0}.finance-ops-summary article{padding:14px 18px;border:1px solid var(--line);border-radius:12px;background:var(--surface,white)}.finance-ops-summary span{display:block;color:var(--muted);font-size:.85rem}.finance-ops-tabs{display:flex;gap:8px;margin:20px 0}.finance-ops-tabs button{padding:10px 14px;border:1px solid var(--line);border-radius:9px;background:var(--surface,white);color:var(--ink);cursor:pointer}.finance-ops-tabs button[aria-pressed="true"]{background:var(--blue,#1769d2);color:white}.finance-ops-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:18px;align-items:start}.finance-ops-card{padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface,white)}.finance-ops-card h2{font-size:1.05rem;margin:0 0 14px}.finance-ops-form input,.finance-ops-form select,.finance-ops-form textarea{width:100%;box-sizing:border-box;padding:10px;margin:0 0 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}.finance-ops-form textarea{min-height:75px;resize:vertical}.finance-ops-table-wrap{overflow:auto}.finance-ops-table{width:100%;border-collapse:collapse;min-width:650px}.finance-ops-table th,.finance-ops-table td{text-align:left;padding:11px 9px;border-bottom:1px solid var(--line);font-size:.88rem}.finance-ops-table th{color:var(--muted)}.finance-ops-status{text-transform:capitalize;white-space:nowrap}.finance-ops-note{color:var(--muted);font-size:.84rem;margin:0 0 14px}.finance-ops-empty{padding:25px;text-align:center;color:var(--muted)}@media(max-width:900px){.finance-ops-grid{grid-template-columns:1fr}}`}</style>
    <header className="finance-ops-head"><p className="eyebrow">School finance</p><h1>Expenses & reconciliation</h1><p>Record school spending and compare provider transactions with school fee payments.</p></header>
    {canManageExpenses || canReconcile ? <div className="finance-ops-summary"><article><span>Recorded expenses</span><strong>{fmt(totalExpenses)}</strong></article><article><span>Transactions to review</span><strong>{reconciliations.filter(row => row.status === 'unmatched').length}</strong></article><article><span>Matched transactions</span><strong>{reconciliations.filter(row => row.status === 'matched').length}</strong></article></div> : null}
    <div className="finance-ops-tabs"><button aria-pressed={section === 'Expenses'} onClick={() => setSection('Expenses')}>Expenses</button><button aria-pressed={section === 'Reconciliation'} onClick={() => setSection('Reconciliation')}>Payment reconciliation</button></div>
    {!canManageExpenses && !canReconcile ? <section className="finance-ops-card finance-ops-empty">This area is limited to the principal, finance officer, and authorized HR staff. Ask the school administrator to assign your finance access in HR & Payroll.</section> : section === 'Expenses' && !canManageExpenses ? <section className="finance-ops-card finance-ops-empty">You do not have permission to manage school expenses.</section> : section === 'Reconciliation' && !canReconcile ? <section className="finance-ops-card finance-ops-empty">Payment reconciliation is limited to the principal and finance officer.</section> : section === 'Expenses' ? <div className="finance-ops-grid"><form className="finance-ops-card finance-ops-form" onSubmit={addExpense}><h2>Record expense</h2><input required maxLength="160" placeholder="Description" value={expense.title} onChange={e => setExpense({ ...expense, title: e.target.value })} /><input required maxLength="80" placeholder="Category" value={expense.category} onChange={e => setExpense({ ...expense, category: e.target.value })} /><input placeholder="Vendor / payee" value={expense.vendor} onChange={e => setExpense({ ...expense, vendor: e.target.value })} /><input required type="number" min="0.01" step="0.01" placeholder="Amount" value={expense.amount} onChange={e => setExpense({ ...expense, amount: e.target.value })} /><input required type="date" value={expense.incurred_on} onChange={e => setExpense({ ...expense, incurred_on: e.target.value })} /><input placeholder="Receipt or voucher reference" value={expense.receipt_reference} onChange={e => setExpense({ ...expense, receipt_reference: e.target.value })} /><textarea placeholder="Notes" value={expense.notes} onChange={e => setExpense({ ...expense, notes: e.target.value })} /><button className="button blue-button" disabled={saving}>{saving ? 'Saving…' : 'Record expense'}</button></form><section className="finance-ops-card"><h2>Expense register</h2>{loading ? <div className="finance-ops-empty">Loading…</div> : expenses.length === 0 ? <div className="finance-ops-empty">No expenses recorded.</div> : <div className="finance-ops-table-wrap"><table className="finance-ops-table"><thead><tr><th>Date</th><th>Description</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{expenses.map(row => <tr key={row.id}><td>{row.incurred_on}</td><td><strong>{row.title}</strong><div className="finance-ops-note">{row.category} · {row.receipt_reference || 'No receipt ref'}</div></td><td>{row.vendor || '—'}</td><td>{fmt(row.amount)}</td><td className="finance-ops-status">{row.status}</td><td>{row.status === 'recorded' && canApprove && <button className="button outline-button" onClick={() => setExpenseStatus(row, 'approved')}>Approve</button>}{row.status === 'approved' && canApprove && <button className="button outline-button" onClick={() => setExpenseStatus(row, 'paid')}>Mark paid</button>}</td></tr>)}</tbody></table></div>}</section></div> : <><p className="finance-ops-note">Add transactions from your bank or mobile money statement, then match them to recorded school payments. This records reconciliation evidence; it does not connect to a payment provider.</p><div className="finance-ops-grid"><form className="finance-ops-card finance-ops-form" onSubmit={addReconciliation}><h2>Add statement transaction</h2><input required placeholder="Provider (bank / mobile money)" value={recon.provider} onChange={e => setRecon({ ...recon, provider: e.target.value })} /><input required placeholder="Provider transaction reference" value={recon.provider_reference} onChange={e => setRecon({ ...recon, provider_reference: e.target.value })} /><input required type="number" min="0.01" step="0.01" placeholder="Amount" value={recon.amount} onChange={e => setRecon({ ...recon, amount: e.target.value })} /><input type="datetime-local" value={recon.transaction_at} onChange={e => setRecon({ ...recon, transaction_at: e.target.value })} /><select value={recon.payment_id} onChange={e => setRecon({ ...recon, payment_id: e.target.value, status: e.target.value ? 'matched' : 'unmatched' })}><option value="">Leave unmatched for review</option>{payments.map(payment => <option key={payment.id} value={payment.id}>{payment.reference || payment.id.slice(0, 8)} · {fmt(payment.amount)} · {payment.status}</option>)}</select><textarea placeholder="Reconciliation note" value={recon.note} onChange={e => setRecon({ ...recon, note: e.target.value })} /><button className="button blue-button" disabled={saving}>{saving ? 'Saving…' : 'Add transaction'}</button></form><section className="finance-ops-card"><h2>Statement transactions</h2>{loading ? <div className="finance-ops-empty">Loading…</div> : reconciliations.length === 0 ? <div className="finance-ops-empty">No statement transactions added.</div> : <div className="finance-ops-table-wrap"><table className="finance-ops-table"><thead><tr><th>Provider / reference</th><th>Date</th><th>Amount</th><th>Payment match</th><th>Status</th><th></th></tr></thead><tbody>{reconciliations.map(row => <tr key={row.id}><td>{row.provider}<div className="finance-ops-note">{row.provider_reference}</div></td><td>{row.transaction_at ? new Date(row.transaction_at).toLocaleString() : '—'}</td><td>{fmt(row.amount)}</td><td>{row.status === 'unmatched' ? <select aria-label="Match school payment" value={reconMatches[row.id] || ''} onChange={e => setReconMatches(current => ({ ...current, [row.id]: e.target.value }))}><option value="">Select payment</option>{payments.filter(payment => Number(payment.amount) === Number(row.amount)).map(payment => <option key={payment.id} value={payment.id}>{payment.reference || payment.id.slice(0, 8)} · {fmt(payment.amount)} · {payment.status}</option>)}</select> : payments.find(payment => payment.id === row.payment_id)?.reference || 'Unmatched'}</td><td className="finance-ops-status">{row.status}</td><td>{row.status === 'unmatched' && <><button className="button outline-button" onClick={() => updateRecon(row, 'matched')}>Match</button><button className="button outline-button" onClick={() => updateRecon(row, 'reviewed', null)}>Mark reviewed</button></>}</td></tr>)}</tbody></table></div>}</section></div></>}
  </main>
}
