import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatters'
import '../styles/staff-workspace.css'

const sections = ['Overview', 'My payslips', 'Leave requests', 'My details']
const statusLabel = value => (value || 'pending').replaceAll('_', ' ')

export default function StaffWorkspace() {
  const { profile, school, demo } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const section = sections.includes(searchParams.get('module')) ? searchParams.get('module') : 'Overview'
  const [employee, setEmployee] = useState(null)
  const [payslips, setPayslips] = useState([])
  const [leave, setLeave] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'Annual leave', start_date: '', end_date: '', reason: '' })

  const load = useCallback(async () => {
    if (!supabase || !profile?.id || !profile.school_id || demo) {
      setEmployee(null); setPayslips([]); setLeave([]); setLoading(false)
      if (!demo) setMessage('Staff self-service is unavailable until this school is connected.')
      return
    }
    setLoading(true)
    setMessage('')
    const [employeeResult, leaveResult, payslipResult] = await Promise.all([
      supabase.from('hr_employees').select('id,staff_number,full_name,email,phone,department,job_title,employment_status,hire_date').eq('school_id', profile.school_id).eq('profile_id', profile.id).maybeSingle(),
      supabase.from('hr_leave_requests').select('id,leave_type,start_date,end_date,reason,status,created_at').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(50),
      supabase.rpc('list_my_staff_payslips')
    ])
    if (employeeResult.error || leaveResult.error || payslipResult.error) {
      setMessage((employeeResult.error || leaveResult.error || payslipResult.error)?.message || 'Could not load your staff workspace.')
      setEmployee(employeeResult.data || null); setLeave(leaveResult.data || []); setPayslips([])
    } else {
      setEmployee(employeeResult.data || null)
      setLeave(leaveResult.data || [])
      setPayslips(payslipResult.data || [])
      if (!employeeResult.data) setMessage('Your school has not linked an employee record to this account yet. Contact the school office.')
    }
    setLoading(false)
  }, [demo, profile?.id, profile?.school_id])

  useEffect(() => { void load() }, [load])

  const currency = school?.currency_code || 'KES'
  const latestPayslip = payslips[0]
  const pendingLeave = useMemo(() => leave.filter(row => row.status === 'pending').length, [leave])
  const payoutLabel = row => statusLabel(row?.payout_status || 'awaiting transfer')

  async function submitLeave(event) {
    event.preventDefault()
    if (!employee || !supabase || demo) return
    setBusy(true); setMessage('')
    const { error } = await supabase.from('hr_leave_requests').insert({
      school_id: profile.school_id, employee_id: employee.id, leave_type: leaveForm.leave_type,
      start_date: leaveForm.start_date, end_date: leaveForm.end_date, reason: leaveForm.reason.trim() || null
    })
    setBusy(false)
    if (error) { setMessage(error.message || 'Could not submit your leave request.'); return }
    setLeaveForm({ leave_type: 'Annual leave', start_date: '', end_date: '', reason: '' })
    await load()
    setMessage('Leave request sent to your school for review.')
  }

  const money = (value, code = currency) => formatCurrency(value, code)
  const selectSection = value => setSearchParams(value === 'Overview' ? {} : { module: value })

  return <main className="staff-workspace">
    <header className="staff-workspace-hero">
      <div><p className="staff-workspace-eyebrow">{school?.name || 'SCHOOL'} · STAFF SELF-SERVICE</p><h1>Hello, {profile?.full_name?.split(' ')[0] || 'there'}</h1></div>
      <div className="staff-workspace-badge"><span>{(profile?.full_name || 'S').trim().charAt(0).toUpperCase()}</span><div><b>{profile?.full_name || 'Staff member'}</b><small>{employee?.job_title || 'Staff account'}</small></div></div>
    </header>

    <div className="staff-workspace-mobile-tabs" role="group" aria-label="Staff workspace sections">{sections.map(item => <button key={item} type="button" className={section === item ? 'active' : ''} onClick={() => selectSection(item)}>{item}</button>)}</div>
    {message && <p className="staff-workspace-message" role="status">{message}</p>}
    {loading ? <div className="staff-workspace-state" role="status">Loading your staff workspace…</div> : <>
      {section === 'Overview' && <>
        <section className="staff-workspace-stats" aria-label="Personal summary">
          <article><span>Latest approved payslip</span><strong>{latestPayslip ? money(latestPayslip.net_pay, latestPayslip.currency_code) : '—'}</strong><small>{latestPayslip?.pay_period ? `${new Date(`${latestPayslip.pay_period}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · ${payoutLabel(latestPayslip)}` : 'No payslip available yet'}</small></article>
          <article><span>Leave requests awaiting review</span><strong>{pendingLeave}</strong></article>
          <article><span>Employment status</span><strong className="staff-status-value">{statusLabel(employee?.employment_status || 'unlinked')}</strong>{employee?.staff_number && <small>Staff number {employee.staff_number}</small>}</article>
        </section>
        <section className="staff-workspace-panel"><div className="staff-workspace-panel-head"><div><p className="staff-workspace-eyebrow">PAY HISTORY</p><h2>Recent payslips</h2></div><button type="button" onClick={() => selectSection('My payslips')}>View all</button></div>
          {payslips.length ? <div className="staff-payslip-list">{payslips.slice(0, 3).map(row => <article key={row.id}><div><b>{new Date(`${row.pay_period}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><small>Net pay · {row.currency_code || currency} · {payoutLabel(row)}{row.payout_reference ? ` · Ref ${row.payout_reference}` : ''}</small></div><strong>{money(row.net_pay, row.currency_code)}</strong></article>)}</div> : <p className="staff-workspace-empty">Approved payslips will appear here once payroll is released.</p>}
        </section>
        <section className="staff-workspace-panel"><div className="staff-workspace-panel-head"><div><p className="staff-workspace-eyebrow">TIME AWAY</p><h2>Leave requests</h2></div><button type="button" onClick={() => selectSection('Leave requests')}>Open requests</button></div>
          {leave.length ? <div className="staff-leave-list">{leave.slice(0, 3).map(row => <article key={row.id}><div><b>{row.leave_type}</b><small>{row.start_date} – {row.end_date}</small></div><span className={`staff-leave-status ${row.status}`}>{statusLabel(row.status)}</span></article>)}</div> : <p className="staff-workspace-empty">You have no leave requests yet.</p>}
        </section>
      </>}

      {section === 'My payslips' && <section className="staff-workspace-panel"><div className="staff-workspace-panel-head"><div><p className="staff-workspace-eyebrow">PRIVATE PAY HISTORY</p><h2>My payslips</h2></div><span>Approved payroll only</span></div>
        {payslips.length ? <div className="staff-payslip-list">{payslips.map(row => <article key={row.id}><div><b>{new Date(`${row.pay_period}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><small>Gross {money(row.gross_pay, row.currency_code)} · Deductions {money(row.total_deductions, row.currency_code)} · {payoutLabel(row)}{row.payout_provider ? ` via ${row.payout_provider}` : ''}{row.payout_reference ? ` · Ref ${row.payout_reference}` : ''}</small></div><strong>{money(row.net_pay, row.currency_code)}</strong></article>)}</div> : <p className="staff-workspace-empty">No approved payslips are available for your account.</p>}
      </section>}

      {section === 'Leave requests' && <div className="staff-workspace-leave-grid"><form className="staff-workspace-panel staff-leave-form" onSubmit={submitLeave}><p className="staff-workspace-eyebrow">REQUEST TIME OFF</p><h2>New leave request</h2><label>Leave type<select value={leaveForm.leave_type} onChange={event => setLeaveForm(current => ({ ...current, leave_type: event.target.value }))}><option>Annual leave</option><option>Sick leave</option><option>Family leave</option><option>Unpaid leave</option><option>Other</option></select></label><div className="staff-leave-dates"><label>Start date<input required type="date" value={leaveForm.start_date} onChange={event => setLeaveForm(current => ({ ...current, start_date: event.target.value }))} /></label><label>End date<input required type="date" min={leaveForm.start_date || undefined} value={leaveForm.end_date} onChange={event => setLeaveForm(current => ({ ...current, end_date: event.target.value }))} /></label></div><label>Note for HR <span>(optional)</span><textarea maxLength="1000" rows="3" value={leaveForm.reason} onChange={event => setLeaveForm(current => ({ ...current, reason: event.target.value }))} placeholder="Add context for your request" /></label><button className="staff-workspace-primary" type="submit" disabled={busy || !employee}>{busy ? 'Sending request…' : 'Submit leave request'}</button></form>
        <section className="staff-workspace-panel"><p className="staff-workspace-eyebrow">YOUR REQUESTS</p><h2>Leave history</h2>{leave.length ? <div className="staff-leave-list">{leave.map(row => <article key={row.id}><div><b>{row.leave_type}</b><small>{row.start_date} – {row.end_date}{row.reason ? ` · ${row.reason}` : ''}</small></div><span className={`staff-leave-status ${row.status}`}>{statusLabel(row.status)}</span></article>)}</div> : <p className="staff-workspace-empty">Requests you submit will appear here.</p>}</section></div>}

      {section === 'My details' && <section className="staff-workspace-panel"><p className="staff-workspace-eyebrow">EMPLOYMENT PROFILE</p><h2>My details</h2>{employee ? <dl className="staff-details-grid">{[['Name', employee.full_name], ['Job title', employee.job_title], ['Department', employee.department], ['Staff number', employee.staff_number], ['Email', employee.email || profile?.email], ['Phone', employee.phone], ['Employment status', statusLabel(employee.employment_status)], ['Start date', employee.hire_date]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="staff-workspace-empty">Your employee record has not been linked yet.</p>}</section>}
    </>}
  </main>
}
