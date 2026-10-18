import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const sections = [
  ['Dashboard', 'Overview and alerts'], ['Recruitment', 'Vacancies and applicants'], ['Staff Records', 'Employee directory'],
  ['Contracts', 'Appointments and renewals'], ['Attendance & Leave', 'Leave requests'], ['Salary Settings', 'Salary structures'],
  ['Payroll', 'Monthly payroll runs'], ['Approvals', 'Principal authorization'], ['Payments', 'Payment tracking'],
  ['Payslips', 'Personal salary history'], ['Security & Reports', 'Access and audit']
]
const tableBySection = { Recruitment: 'job_vacancies', 'Staff Records': 'hr_employees', Contracts: 'employment_contracts', 'Attendance & Leave': 'hr_leave_requests', 'Salary Settings': 'salary_structures', Payroll: 'payroll_runs', Approvals: 'payroll_approvals', Payments: 'payment_transactions' }

export default function HrPayrollPortal() {
  const { profile, school, staffRoles, demo } = useAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState('Dashboard')
  const [accessRole, setAccessRole] = useState('')
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({ staff: 0, payroll: 0, approvals: 0, recruitment: 0 })
  const [people, setPeople] = useState([])
  const [grants, setGrants] = useState([])
  const [employees, setEmployees] = useState([])
  const [payItems, setPayItems] = useState([])
  const [auditRows, setAuditRows] = useState([])
  const [message, setMessage] = useState('Loading HR workspace…')
  const [busy, setBusy] = useState(false)
  const [staffForm, setStaffForm] = useState({ staff_number: '', full_name: '', job_title: '', department: '', email: '', phone: '', profile_id: '' })
  const [vacancyForm, setVacancyForm] = useState({ title: '', department: '', description: '' })
  const [salaryForm, setSalaryForm] = useState({ employee_id: '', basic_salary: '', allowance: '0', deduction: '0', payment_method: 'bank', effective_from: new Date().toISOString().slice(0, 10) })
  const [contractForm, setContractForm] = useState({ employee_id: '', contract_type: 'Permanent', start_date: new Date().toISOString().slice(0, 10), end_date: '' })
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', leave_type: 'Annual', start_date: '', end_date: '', reason: '' })
  const [paymentForm, setPaymentForm] = useState({ payroll_item_id: '', provider: 'bank', transaction_reference: '', amount: '' })
  const [payoutAccount, setPayoutAccount] = useState({ currency_code: 'KES', bank_name: '', bank_account_name: '', bank_account_number: '', bank_routing_code: '', mobile_money_provider: '', mobile_money_number: '' })
  const isSchoolAdmin = profile?.role === 'school_admin'
  const canManageStaff = isSchoolAdmin || ['principal', 'hr_admin'].includes(accessRole)
  const canPreparePayroll = isSchoolAdmin || ['principal', 'hr_admin', 'finance_officer'].includes(accessRole)
  const canApprove = isSchoolAdmin || accessRole === 'principal'
  const canPay = isSchoolAdmin || ['principal', 'finance_officer'].includes(accessRole)
  const canEditPayout = isSchoolAdmin || accessRole === 'principal'
  const currencyCode = /^[A-Z]{3}$/.test(school?.currency_code || '') ? school.currency_code : 'KES'
  const money = value => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(Number(value || 0)) }
    catch { return `${currencyCode} ${Number(value || 0).toLocaleString()}` }
  }

  useEffect(() => { if (profile) load() }, [profile, section, demo])

  async function load() {
    if (demo) {
      setAccessRole('principal')
      setStats({ staff: 86, payroll: 3, approvals: 1, recruitment: 4 })
      setRows(section === 'Dashboard' ? [
        { id: 'demo-payroll-1', pay_period: '2026-10', status: 'submitted' },
        { id: 'demo-payroll-2', pay_period: '2026-09', status: 'approved' },
        { id: 'demo-payroll-3', pay_period: '2026-08', status: 'paid' }
      ] : [])
      setMessage(section === 'Dashboard' ? '' : 'The HR demo is read only and shows sample dashboard data. Sign in to an authorized school account to manage staff and payroll records.')
      return
    }
    if (!supabase || !profile?.school_id) { setMessage('Connect this school to Supabase to use HR and payroll records.'); return }
    setMessage('')
    try {
      const [{ data: roleRows, error: roleError }, { data: assignedRows, error: assignedError }] = await Promise.all([
        supabase.from('school_hr_roles').select('hr_role').eq('school_id', profile.school_id).eq('profile_id', profile.id).maybeSingle(),
        supabase.from('school_staff_role_assignments').select('role_key').eq('school_id', profile.school_id).eq('profile_id', profile.id)
      ])
      if (roleError && roleError.code !== '42P01') throw roleError
      if (assignedError && assignedError.code !== '42P01') throw assignedError
      const effectiveRoles = [...new Set([roleRows?.hr_role, ...(assignedRows || []).map(row => row.role_key), ...staffRoles].filter(Boolean))]
      const effectiveRole = ['principal','hr_admin','finance_officer'].find(role => effectiveRoles.includes(role)) || ''
      setAccessRole(effectiveRole)
      if (!isSchoolAdmin && !effectiveRole) { setMessage('You do not have an HR portal role. Ask your school administrator to grant access.'); return }
      const [staffRes, payrollRes, vacanciesRes, applicationRes] = await Promise.all([
        supabase.from('hr_employees').select('id,employment_status').eq('school_id', profile.school_id),
        supabase.from('payroll_runs').select('id,status,pay_period').eq('school_id', profile.school_id).order('pay_period', { ascending: false }).limit(12),
        supabase.from('job_vacancies').select('id,status').eq('school_id', profile.school_id),
        supabase.from('job_applications').select('id,status').eq('school_id', profile.school_id)
      ])
      for (const result of [staffRes, payrollRes, vacanciesRes, applicationRes]) if (result.error && result.error.code !== '42P01') throw result.error
      setStats({ staff: staffRes.data?.filter(x => x.employment_status === 'active').length || 0, payroll: payrollRes.data?.length || 0, approvals: payrollRes.data?.filter(x => x.status === 'submitted').length || 0, recruitment: applicationRes.data?.length || 0 })
      if (section === 'Dashboard') setRows(payrollRes.data || [])
      if (section === 'Payslips') {
        const { data: items, error } = await supabase.from('payroll_items').select('*, payroll_runs!inner(pay_period,status), hr_employees!inner(profile_id,full_name)').eq('school_id', profile.school_id).eq('hr_employees.profile_id', profile.id).in('payroll_runs.status', ['approved','paying','paid','closed']).order('created_at', { ascending: false })
        if (error) throw error
        setRows(items || [])
      } else if (tableBySection[section]) {
        const { data, error } = await supabase.from(tableBySection[section]).select('*').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(100)
        if (error) throw error
        setRows(data || [])
      }
      if (['Salary Settings','Contracts','Attendance & Leave'].includes(section)) {
        const { data, error } = await supabase.from('hr_employees').select('id,full_name,staff_number,profile_id').eq('school_id', profile.school_id).order('full_name')
        if (error) throw error
        setEmployees(data || [])
        if (!salaryForm.employee_id && data?.length) setSalaryForm(current => ({ ...current, employee_id: data[0].id }))
        const ownEmployee = data?.find(employee => employee.profile_id === profile.id)
        if (ownEmployee) setLeaveForm(current => ({ ...current, employee_id: ownEmployee.id }))
      }
      if (section === 'Payments' && canPay) {
        const { data: payout, error: payoutError } = await supabase.from('school_payroll_accounts').select('*').eq('school_id', profile.school_id).maybeSingle()
        if (payoutError && payoutError.code !== '42P01') throw payoutError
        if (payout) setPayoutAccount(payout)
        else setPayoutAccount(current => ({ ...current, currency_code: currencyCode }))
        const { data, error } = await supabase.from('payroll_items').select('id,employee_id,net_pay,payroll_runs!inner(pay_period,status),hr_employees!inner(full_name,staff_number)').eq('school_id', profile.school_id).in('payroll_runs.status', ['approved','paying','paid']).order('created_at', { ascending: false }).limit(300)
        if (error) throw error
        const { data: transactions, error: paymentError } = await supabase.from('payment_transactions').select('payroll_item_id,status').eq('school_id', profile.school_id)
        if (paymentError) throw paymentError
        const paidIds = new Set((transactions || []).filter(payment => payment.status === 'paid').map(payment => payment.payroll_item_id))
        const unpaid = (data || []).filter(item => !paidIds.has(item.id))
        setPayItems(unpaid)
      }
      if (section === 'Security & Reports' && isSchoolAdmin) {
        const [profilesRes, grantsRes] = await Promise.all([
          supabase.from('profiles').select('id,full_name,email,role').eq('school_id', profile.school_id).order('full_name'),
          supabase.from('school_hr_roles').select('id,profile_id,hr_role').eq('school_id', profile.school_id)
        ])
        if (profilesRes.error) throw profilesRes.error
        if (grantsRes.error) throw grantsRes.error
        setPeople(profilesRes.data || []); setGrants(grantsRes.data || [])
      }
      if (section === 'Security & Reports' && (isSchoolAdmin || ['principal','hr_admin'].includes(roleRows?.hr_role))) {
        const { data, error } = await supabase.from('hr_audit_events').select('created_at,actor_id,action,entity_type,entity_id,details').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(200)
        if (error) throw error
        setAuditRows(data || [])
      }
    } catch (error) { setMessage(error.message || 'Could not load the HR workspace.') }
  }

  async function createEmployee(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.from('hr_employees').insert({ ...staffForm, profile_id: staffForm.profile_id || null, school_id: profile.school_id, created_by: profile.id })
    setBusy(false)
    if (error) setMessage(error.message); else { setStaffForm({ staff_number: '', full_name: '', job_title: '', department: '', email: '', phone: '', profile_id: '' }); await load() }
  }

  async function createVacancy(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.from('job_vacancies').insert({ ...vacancyForm, school_id: profile.school_id, created_by: profile.id })
    setBusy(false)
    if (error) setMessage(error.message); else { setVacancyForm({ title: '', department: '', description: '' }); await load() }
  }

  async function saveSalary(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const basic = Number(salaryForm.basic_salary), allowance = Number(salaryForm.allowance), deduction = Number(salaryForm.deduction)
    const { error } = await supabase.from('salary_structures').insert({ school_id: profile.school_id, employee_id: salaryForm.employee_id, basic_salary: basic, allowances: allowance ? [{ name: 'Allowance', amount: allowance }] : [], deductions: deduction ? [{ name: 'Deduction', amount: deduction }] : [], payment_method: salaryForm.payment_method, effective_from: salaryForm.effective_from, created_by: profile.id })
    setBusy(false)
    if (error) setMessage(error.message); else { setMessage('Salary structure saved. Obtain principal authorization before using an unapproved change in payroll.'); await load() }
  }

  async function saveContract(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.from('employment_contracts').insert({ ...contractForm, school_id: profile.school_id, created_by: profile.id, end_date: contractForm.end_date || null })
    setBusy(false)
    if (error) setMessage(error.message); else { setContractForm({ employee_id: '', contract_type: 'Permanent', start_date: new Date().toISOString().slice(0, 10), end_date: '' }); await load() }
  }

  async function requestLeave(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.from('hr_leave_requests').insert({ ...leaveForm, school_id: profile.school_id })
    setBusy(false)
    if (error) setMessage(error.message); else { setMessage('Leave request submitted for review.'); await load() }
  }

  async function recordPayment(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.from('payment_transactions').insert({ ...paymentForm, school_id: profile.school_id, amount: Number(paymentForm.amount), initiated_by: profile.id, status: 'pending' })
    setBusy(false)
    if (error) setMessage(error.message); else { setMessage('Payment record added as pending. Update it only after confirming the transaction with the payment provider.'); await load() }
  }

  async function savePayoutAccount(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.from('school_payroll_accounts').upsert({ ...payoutAccount, school_id: profile.school_id, currency_code: currencyCode, updated_by: profile.id, updated_at: new Date().toISOString() }, { onConflict: 'school_id' })
    setBusy(false)
    if (error) setMessage(error.message); else { setMessage('School salary payout account saved. Provider credentials are not stored in this form.'); await load() }
  }

  async function updatePayment(row, status) {
    const { error } = await supabase.from('payment_transactions').update({ status, confirmed_at: status === 'paid' ? new Date().toISOString() : null }).eq('id', row.id)
    if (error) setMessage(error.message); else await load()
  }

  async function reviewLeave(row, status) {
    const { error } = await supabase.from('hr_leave_requests').update({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() }).eq('id', row.id)
    if (error) setMessage(error.message); else await load()
  }

  async function reviewSalary(row, decision) {
    const { error } = await supabase.rpc('review_salary_change', { target_salary: row.id, decision_value: decision })
    if (error) setMessage(error.message); else { setMessage(`Salary change ${decision}.`); await load() }
  }

  async function preparePayroll() {
    const period = window.prompt('Enter the payroll month (YYYY-MM)', new Date().toISOString().slice(0, 7))
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return
    setBusy(true); setMessage('')
    try {
      const date = `${period}-01`
      const { data: run, error: runError } = await supabase.from('payroll_runs').insert({ school_id: profile.school_id, pay_period: date, prepared_by: profile.id, currency_code: currencyCode }).select().single()
      if (runError) throw runError
      const { data: employees, error: employeeError } = await supabase.from('hr_employees').select('id').eq('school_id', profile.school_id).eq('employment_status', 'active')
      if (employeeError) throw employeeError
      const items = []
      for (const employee of employees || []) {
        const { data: salary, error: salaryError } = await supabase.from('salary_structures').select('*').eq('school_id', profile.school_id).eq('employee_id', employee.id).eq('approval_status', 'approved').lte('effective_from', date).or(`effective_to.is.null,effective_to.gte.${date}`).order('effective_from', { ascending: false }).limit(1).maybeSingle()
        if (salaryError) throw salaryError
        if (!salary) continue
        const sum = list => (Array.isArray(list) ? list : []).reduce((total, item) => total + Number(item.amount || 0), 0)
        const allowanceTotal = sum(salary.allowances), deductionTotal = sum(salary.deductions)
        const gross = Number(salary.basic_salary) + allowanceTotal
        items.push({ school_id: profile.school_id, payroll_run_id: run.id, employee_id: employee.id, basic_salary: salary.basic_salary, allowances: salary.allowances, deductions: salary.deductions, gross_pay: gross, total_deductions: deductionTotal, net_pay: Math.max(0, gross - deductionTotal) })
      }
      if (items.length) { const { error } = await supabase.from('payroll_items').insert(items); if (error) throw error }
      setMessage(`Payroll draft created for ${period}. ${items.length} active salary records were included; confirm leave and statutory adjustments before submission.`)
      await load()
    } catch (error) { setMessage(error.message || 'Could not prepare payroll.') }
    finally { setBusy(false) }
  }

  async function submitPayroll(run) {
    const { error } = await supabase.from('payroll_runs').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', run.id).eq('status', 'draft')
    if (error) setMessage(error.message); else await load()
  }
  async function approvePayroll(run, decision) {
    const notes = decision === 'rejected' ? window.prompt('Reason for returning this payroll for correction:') : window.prompt('Approval note (optional):')
    if (decision === 'rejected' && !notes) return
    const { error } = await supabase.rpc('approve_school_payroll', { target_run: run.id, decision_value: decision, approval_notes: notes || null })
    if (error) setMessage(error.message); else { setMessage('Payroll decision recorded with the payroll version and MFA assurance.'); await load() }
  }

  async function assignHrRole(personId, role) {
    const existing = grants.find(x => x.profile_id === personId)
    const result = role
      ? existing ? await supabase.from('school_hr_roles').update({ hr_role: role, assigned_by: profile.id }).eq('id', existing.id) : await supabase.from('school_hr_roles').insert({ school_id: profile.school_id, profile_id: personId, hr_role: role, assigned_by: profile.id })
      : existing ? await supabase.from('school_hr_roles').delete().eq('id', existing.id) : { error: null }
    if (result.error) setMessage(result.error.message); else await load()
  }

  function exportCsv(name, data) {
    if (!data?.length) { setMessage('There are no records to export.'); return }
    const columns = Object.keys(data[0])
    const quote = value => `"${String(typeof value === 'object' && value !== null ? JSON.stringify(value) : value ?? '').replaceAll('"','""')}"`
    const content = [columns.map(quote).join(','), ...data.map(row => columns.map(column => quote(row[column])).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-')}.csv`; anchor.click(); URL.revokeObjectURL(url)
  }

  const title = useMemo(() => sections.find(item => item[0] === section)?.[1], [section])
  return <main className="hr-page"><style>{`.hr-page{min-height:100vh;background:var(--bg);color:var(--ink);padding:24px}.hr-shell{max-width:1400px;margin:auto}.hr-head{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:24px}.hr-head h1{margin:0;color:var(--green);font-size:2rem}.hr-head p{margin:5px 0;color:var(--muted)}.hr-layout{display:grid;grid-template-columns:230px 1fr;gap:22px}.hr-nav,.hr-card{background:var(--panel);border:1px solid var(--line);border-radius:14px}.hr-nav{padding:10px;height:max-content}.hr-nav button{width:100%;display:block;text-align:left;padding:11px;border:0;background:transparent;color:var(--ink);border-radius:8px;cursor:pointer}.hr-nav button.active{background:var(--green);color:white}.hr-main{min-width:0}.hr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;margin-bottom:18px}.hr-card{padding:18px}.hr-stat small,.hr-muted{color:var(--muted)}.hr-stat strong{display:block;font-size:1.8rem;margin-top:6px}.hr-table-wrap{overflow:auto}.hr-table{width:100%;border-collapse:collapse}.hr-table td,.hr-table th{text-align:left;padding:12px;border-bottom:1px solid var(--line);white-space:nowrap}.hr-table th{color:var(--muted);font-size:.83rem}.hr-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:0 0 18px}.hr-form input,.hr-form textarea,.hr-form select{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}.hr-form textarea{grid-column:1/-1;min-height:75px}.hr-button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:9px 13px;cursor:pointer}.hr-button.primary{background:var(--green);color:#fff;border-color:var(--green)}.hr-alert{padding:13px;background:var(--cream);border-radius:10px;margin-bottom:16px}.hr-pill{display:inline-block;border-radius:99px;padding:4px 9px;background:var(--cream);font-size:.8rem}.hr-access{display:flex;align-items:center;gap:10px}.hr-access select{padding:7px;border-radius:7px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}@media(max-width:850px){.hr-layout{grid-template-columns:1fr}.hr-nav{display:flex;overflow:auto;gap:5px}.hr-nav button{white-space:nowrap;width:auto}.hr-head{align-items:flex-start;flex-direction:column}}`}</style>
    <div className="hr-shell">
      <header className="hr-head"><div><h1>School HR & Payroll</h1><p>Centralized management portal · {title}</p>{demo && <span className="hr-pill">Read-only demo · sample data</span>}</div><button className="hr-button" onClick={() => navigate('/portal')}>← Back to school portal</button></header>
      <div className="hr-layout"><nav className="hr-nav" aria-label="HR and payroll modules">{sections.map(([name]) => <button key={name} disabled={demo && name !== 'Dashboard'} className={section === name ? 'active' : ''} onClick={() => { if (demo) return; setSection(name); setMessage('') }}>{name}</button>)}</nav>
        <section className="hr-main">
          {message && <div className="hr-alert" role="status">{message}</div>}
          {section === 'Dashboard' && !message && <><div className="hr-grid">{[['Active staff', stats.staff], ['Payroll runs', stats.payroll], ['Awaiting approval', stats.approvals], ['Applications', stats.recruitment]].map(([label, value]) => <article className="hr-card hr-stat" key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><article className="hr-card"><h2>Recent payroll runs</h2><p className="hr-muted">{demo ? 'Sample payroll activity for preview only. No real staff or salary records are shown.' : 'Prepare salaries from effective salary records, then submit for principal approval.'}</p><div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Pay period</th><th>Status</th>{!demo && <th>Action</th>}</tr></thead><tbody>{rows.map(run => <tr key={run.id}><td>{run.pay_period}</td><td><span className="hr-pill">{run.status}</span></td>{!demo && <td>{canPreparePayroll && run.status === 'draft' && <button className="hr-button" onClick={() => submitPayroll(run)}>Submit for approval</button>}{canApprove && run.status === 'submitted' && <><button className="hr-button primary" onClick={() => approvePayroll(run, 'approved')}>Approve</button> <button className="hr-button" onClick={() => approvePayroll(run, 'rejected')}>Return</button></>}</td>}</tr>)}</tbody></table></div>{canPreparePayroll && !demo && <button className="hr-button primary" disabled={busy} onClick={preparePayroll}>＋ Prepare monthly payroll</button>}</article></>}
          {section === 'Staff Records' && <><article className="hr-card"><h2>Staff records</h2>{canManageStaff && <form className="hr-form" onSubmit={createEmployee}>{Object.keys(staffForm).map(key => <input key={key} required={['staff_number','full_name','job_title'].includes(key)} placeholder={key.replaceAll('_',' ')} value={staffForm[key]} onChange={e => setStaffForm({ ...staffForm, [key]: e.target.value })}/>)}<button className="hr-button primary" disabled={busy}>Add employee</button></form>}<div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Staff ID</th><th>Name</th><th>Role</th><th>Department</th><th>Status</th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td>{x.staff_number}</td><td>{x.full_name}</td><td>{x.job_title}</td><td>{x.department || '—'}</td><td>{x.employment_status}</td></tr>)}</tbody></table></div></article></>}
          {section === 'Recruitment' && <article className="hr-card"><h2>Recruitment</h2>{canManageStaff && <form className="hr-form" onSubmit={createVacancy}><input required placeholder="Vacancy title" value={vacancyForm.title} onChange={e => setVacancyForm({ ...vacancyForm, title: e.target.value })}/><input placeholder="Department" value={vacancyForm.department} onChange={e => setVacancyForm({ ...vacancyForm, department: e.target.value })}/><textarea placeholder="Role description and requirements" value={vacancyForm.description} onChange={e => setVacancyForm({ ...vacancyForm, description: e.target.value })}/><button className="hr-button primary" disabled={busy}>Save draft vacancy</button></form>}<div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Position</th><th>Department</th><th>Status</th><th>Closes</th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td>{x.title}</td><td>{x.department || '—'}</td><td>{x.status}</td><td>{x.closes_at || '—'}</td></tr>)}</tbody></table></div></article>}
          {section === 'Payslips' && <article className="hr-card"><h2>My payslips & salary history</h2><p className="hr-muted">Your payroll records are only visible to your account and authorized school payroll staff.</p><div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Period</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Payroll status</th></tr></thead><tbody>{rows.map(x => <tr key={x.id}><td>{x.payroll_runs?.pay_period || '—'}</td><td>{money(x.gross_pay)}</td><td>{money(x.total_deductions)}</td><td>{money(x.net_pay)}</td><td>{x.payroll_runs?.status}</td></tr>)}</tbody></table></div></article>}
          {section === 'Security & Reports' && <><article className="hr-card"><h2>Portal access</h2><p className="hr-muted">School administrators grant HR roles. Platform super administrators do not receive payroll access by default.</p>{isSchoolAdmin ? <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Account</th><th>School login role</th><th>HR portal role</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td>{person.full_name || person.email}</td><td>{person.role}</td><td><div className="hr-access"><select value={grants.find(x => x.profile_id === person.id)?.hr_role || ''} onChange={e => assignHrRole(person.id, e.target.value)}><option value="">No HR access</option><option value="principal">Principal</option><option value="hr_admin">HR / Administrator</option><option value="finance_officer">Finance Officer</option><option value="staff_member">Staff Member</option></select></div></td></tr>)}</tbody></table></div> : <p>Your access role: <b>{accessRole || profile?.role}</b></p>}</article><article className="hr-card"><h2>Sensitive activity log</h2><button className="hr-button" onClick={() => exportCsv('hr-audit-events', auditRows)}>Export audit CSV</button><div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record type</th><th>Record ID</th></tr></thead><tbody>{auditRows.map(row => <tr key={`${row.created_at}-${row.entity_id}`}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.actor_id || 'System'}</td><td>{row.action}</td><td>{row.entity_type}</td><td>{row.entity_id}</td></tr>)}</tbody></table></div></article></>}
          {tableBySection[section] && !['Staff Records','Recruitment'].includes(section) && <article className="hr-card"><h2>{section}</h2><p className="hr-muted">Records are restricted by school role and employee relationship.</p>
            {section === 'Salary Settings' && canManageStaff && <form className="hr-form" onSubmit={saveSalary}><select required value={salaryForm.employee_id} onChange={e => setSalaryForm({ ...salaryForm, employee_id: e.target.value })}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name} · {e.staff_number}</option>)}</select><input required type="number" min="0" step="0.01" placeholder={`Basic salary (${currencyCode})`} value={salaryForm.basic_salary} onChange={e => setSalaryForm({ ...salaryForm, basic_salary: e.target.value })}/><input type="number" min="0" step="0.01" placeholder={`Monthly allowance (${currencyCode})`} value={salaryForm.allowance} onChange={e => setSalaryForm({ ...salaryForm, allowance: e.target.value })}/><input type="number" min="0" step="0.01" placeholder={`Monthly deduction (${currencyCode})`} value={salaryForm.deduction} onChange={e => setSalaryForm({ ...salaryForm, deduction: e.target.value })}/><input required type="date" value={salaryForm.effective_from} onChange={e => setSalaryForm({ ...salaryForm, effective_from: e.target.value })}/><select value={salaryForm.payment_method} onChange={e => setSalaryForm({ ...salaryForm, payment_method: e.target.value })}><option value="bank">Bank</option><option value="mobile_money">{school?.mobile_money_provider || 'Mobile money'}</option><option value="cash">Cash</option><option value="other">Other</option></select><button className="hr-button primary" disabled={busy}>Save salary structure</button></form>}
            {section === 'Contracts' && canManageStaff && <form className="hr-form" onSubmit={saveContract}><select required value={contractForm.employee_id} onChange={e => setContractForm({ ...contractForm, employee_id: e.target.value })}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name} · {e.staff_number}</option>)}</select><input required placeholder="Contract type" value={contractForm.contract_type} onChange={e => setContractForm({ ...contractForm, contract_type: e.target.value })}/><input required type="date" value={contractForm.start_date} onChange={e => setContractForm({ ...contractForm, start_date: e.target.value })}/><input type="date" value={contractForm.end_date} onChange={e => setContractForm({ ...contractForm, end_date: e.target.value })}/><button className="hr-button primary" disabled={busy}>Create contract record</button></form>}
            {section === 'Attendance & Leave' && employees.some(e => e.profile_id === profile.id) && <form className="hr-form" onSubmit={requestLeave}><select value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}><option>Annual</option><option>Sick</option><option>Parental</option><option>Study</option><option>Unpaid</option></select><input required type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })}/><input required type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })}/><input placeholder="Reason" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}/><button className="hr-button primary" disabled={busy}>Request leave</button></form>}
            {section === 'Payments' && canEditPayout && <><h3>Private salary payout account</h3><p className="hr-muted">Only the school administrator or principal can edit these details. Finance officers can view them. Keep provider API credentials out of this form.</p><form className="hr-form" onSubmit={savePayoutAccount}><input placeholder="Bank name" value={payoutAccount.bank_name || ''} onChange={e => setPayoutAccount({ ...payoutAccount, bank_name: e.target.value })}/><input placeholder="Bank account name" value={payoutAccount.bank_account_name || ''} onChange={e => setPayoutAccount({ ...payoutAccount, bank_account_name: e.target.value })}/><input placeholder="Bank account number" value={payoutAccount.bank_account_number || ''} onChange={e => setPayoutAccount({ ...payoutAccount, bank_account_number: e.target.value })}/><input placeholder="Bank routing / branch code" value={payoutAccount.bank_routing_code || ''} onChange={e => setPayoutAccount({ ...payoutAccount, bank_routing_code: e.target.value })}/><input placeholder="Mobile money provider" value={payoutAccount.mobile_money_provider || ''} onChange={e => setPayoutAccount({ ...payoutAccount, mobile_money_provider: e.target.value })}/><input placeholder="Mobile money payout number" value={payoutAccount.mobile_money_number || ''} onChange={e => setPayoutAccount({ ...payoutAccount, mobile_money_number: e.target.value })}/><button className="hr-button primary" disabled={busy}>Save payout details</button></form></>}
            {section === 'Payments' && canPay && !canEditPayout && <><h3>Private salary payout account</h3><p className="hr-muted">Configured salary account · {payoutAccount.currency_code || currencyCode}</p><p>{payoutAccount.bank_name || 'No bank account configured'} · {payoutAccount.bank_account_name || ''} · {payoutAccount.bank_account_number || ''}</p><p>{payoutAccount.mobile_money_provider || ''} · {payoutAccount.mobile_money_number || ''}</p></>}
            {section === 'Payments' && canPay && <form className="hr-form" onSubmit={recordPayment}><select required value={paymentForm.payroll_item_id} onChange={e => { const item = payItems.find(x => x.id === e.target.value); setPaymentForm({ ...paymentForm, payroll_item_id: e.target.value, amount: String(item?.net_pay || '') }) }}><option value="">Select approved payroll item</option>{payItems.map(item => <option key={item.id} value={item.id}>{item.hr_employees?.full_name} · {item.payroll_runs?.pay_period} · {money(item.net_pay)}</option>)}</select><select value={paymentForm.provider} onChange={e => setPaymentForm({ ...paymentForm, provider: e.target.value })}><option value="bank">Bank</option><option value="mobile_money">{school?.mobile_money_provider || 'Mobile money'}</option><option value="cash">Cash</option><option value="other">Other</option></select><input required type="number" min="0" step="0.01" placeholder="Amount" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}/><input placeholder="Transaction reference" value={paymentForm.transaction_reference} onChange={e => setPaymentForm({ ...paymentForm, transaction_reference: e.target.value })}/><button className="hr-button primary" disabled={busy || !payItems.length}>Record pending payment</button></form>}
            <div className="hr-table-wrap"><table className="hr-table"><thead><tr>{(rows[0] ? Object.keys(rows[0]).filter(k => !['school_id','id','created_by','updated_at'].includes(k)).slice(0, 6) : ['No records']).map(key => <th key={key}>{key.replaceAll('_',' ')}</th>)}{['Payments','Attendance & Leave','Salary Settings'].includes(section) && <th>Review</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{Object.keys(row).filter(k => !['school_id','id','created_by','updated_at'].includes(k)).slice(0, 6).map(key => <td key={key}>{typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? '—')}</td>)}{section === 'Payments' && canPay && <td>{row.status !== 'paid' && <button className="hr-button primary" onClick={() => updatePayment(row, 'paid')}>Confirm paid</button>}{row.status === 'pending' && <button className="hr-button" onClick={() => updatePayment(row, 'failed')}>Mark failed</button>}</td>}{section === 'Attendance & Leave' && canManageStaff && <td>{row.status === 'pending' && <><button className="hr-button primary" onClick={() => reviewLeave(row, 'approved')}>Approve</button> <button className="hr-button" onClick={() => reviewLeave(row, 'rejected')}>Reject</button></>}</td>}{section === 'Salary Settings' && canApprove && <td>{row.approval_status === 'pending' && <><button className="hr-button primary" onClick={() => reviewSalary(row, 'approved')}>Approve</button> <button className="hr-button" onClick={() => reviewSalary(row, 'rejected')}>Reject</button></>}</td>}</tr>)}</tbody></table></div>
          </article>}
          {section === 'Approvals' && <p className="hr-muted">Use the payroll review actions on the Dashboard. Approval requires a principal role and verified MFA on the signed-in account.</p>}
          {section === 'Payments' && <p className="hr-muted">Records begin as pending; confirm provider settlement before marking a payment complete. The portal records bank and mobile-money transactions but does not initiate transfers until a payout provider is integrated.</p>}
          {section === 'Attendance & Leave' && <p className="hr-muted">Leave applications are recorded here. Contract file upload, attendance adjustments, and payroll-linked leave calculations still need configuration.</p>}
          {section === 'Contracts' && <p className="hr-muted">This records contract terms. Contract file upload and signature verification require the school's private storage and signing configuration.</p>}
          {section === 'Salary Settings' && <p className="hr-muted">Payroll preparation snapshots the effective salary structure. Review changes and statutory adjustments before submitting for approval.</p>}
        </section>
      </div>
    </div>
  </main>
}
