import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PaymentFlow from './PaymentFlow'
import toast from 'react-hot-toast'
import { sendAttendanceAlert } from '../lib/notifications'
import Skeleton, { SkeletonTable, SkeletonCard } from './Skeleton'
import ConfirmShield from './ConfirmShield'

import { Link } from 'react-router-dom'

const labels={schools:'Schools',profiles:'People',students:'Students',classes:'Classes',subjects:'Subjects',attendance:'Attendance',assignments:'Assignments',exams:'Exams',results:'Results',fees:'Fees',payments:'Payments',announcements:'Announcements',events:'Events',messages:'Messages',subscriptions:'Subscriptions'}
const fields={schools:['name','status','subscription_plan'],profiles:['full_name','role'],students:['admission_number','full_name'],classes:['name','grade'],subjects:['name','code'],attendance:['student','attendance_date','status'],assignments:['title','due_date','status'],exams:['name','exam_date'],results:['student','score','remarks'],fees:['name','amount','due_date'],payments:['reference','amount','status'],announcements:['title','created_at'],events:['title','event_date'],messages:['body','created_at'],subscriptions:['plan','status']}

export default function ModulePanel({table,profile,canCreate=false,superAdmin=false,studentId=null}){
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[form,setForm]=useState(false),[payingRow,setPayingRow]=useState(null),[searchTerm,setSearchTerm]=useState('')
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);

  const cols=fields[table]||[],title=labels[table]||table

  const deleteRow = async () => {
    if (!rowToDelete) return;
    const toastId = toast.loading('Deleting record...');
    try {
      if (supabase) {
        const { error } = await supabase.from(table).delete().eq('id', rowToDelete.id);
        if (error) throw error;
      }
      toast.success('Record deleted successfully!', { id: toastId });
      load();
    } catch (e) {
      toast.error('Failed to delete: ' + e.message, { id: toastId });
    }
  };

  const filteredRows = rows.filter(row =>
    Object.values(row).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exportCSV = () => {
    const header = cols.join(',');
    const rowsCSV = filteredRows.map(r => cols.map(c => r[c]).join(',')).join('\n');
    const blob = new Blob([`${header}\n${rowsCSV}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.csv`;
    a.click();
  };

  const showReportBtn = (table === 'results' || table === 'students') && (studentId || (table === 'results' && rows.length > 0));

  const handlePaymentSuccess = async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payingRow.id);
      if (error) throw error;
      toast.success('Payment recorded successfully!');
      load();
    } catch (e) {
      toast.error('Failed to update payment record.');
    }
  };

  const load=async()=>{setBusy(true);setMessage('');try{if(!supabase)return;let query=supabase.from(table).select('*').limit(50);if(profile?.school_id&&table!=='schools')query=query.eq('school_id',profile.school_id);if(table==='schools'&&!superAdmin&&profile?.school_id)query=query.eq('id',profile.school_id);const {data,error}=await query;if(error)throw error;setRows(data||[])}catch(error){setMessage(error.message||'Could not load this module.')}finally{setBusy(false)}}
  useEffect(()=>{load()},[table,profile?.school_id])
  const placeholders=useMemo(()=>cols.filter(field=>!['status','created_at'].includes(field)).slice(0,3),[table])
  async function create(event){event.preventDefault();setMessage('');const values=Object.fromEntries(new FormData(event.currentTarget));try{
    if (table === 'attendance' && values.status?.toLowerCase() === 'absent') {
      sendAttendanceAlert(values.student || 'A student');
    }
    if(!supabase)return;const payload={...values};if(profile?.school_id&&table!=='schools')payload.school_id=profile.school_id;const {error}=await supabase.from(table).insert(payload);if(error)throw error;setForm(false);load()}catch(error){setMessage(error.message||'Could not save this record.')}}
  async function review(id,status){try{const {error}=await supabase.rpc('review_school',{target_school:id,new_status:status});if(error)throw error;load()}catch(error){setMessage(error.message||'Could not update the school.')}}
  return <section className="panel module glass-card page-transition">
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{busy?'Loading records…':`${filteredRows.length} record${filteredRows.length===1?'':'s'} available`}</p>
      </div>
      <div className="panel-actions">
        <input
          className="search-input"
          placeholder="Search..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{padding: '8px 15px', borderRadius: '8px', border: '1px solid var(--line)', marginRight: '10px'}}
        />
        {['super_admin', 'school_admin'].includes(profile?.role) && (
          <button className="outline tactile-btn" onClick={exportCSV} style={{marginRight: '10px'}}>Export CSV 📥</button>
        )}
        {showReportBtn && (
          <Link
            to={`/report-card/${studentId || rows[0]?.student_id || rows[0]?.id}`}
            className="button small blue-button tactile-btn"
            style={{marginRight: '10px'}}
          >
            View Report Card 📊
          </Link>
        )}
        {canCreate&&<button className="button small tactile-btn" onClick={()=>setForm(!form)}>Add {title.replace(/s$/,'')} +</button>}
        <button className="outline tactile-btn" onClick={load} disabled={busy}>Refresh</button>
      </div>
    </div>

    {message&&<p className="error">{message}</p>}
    {form&&<form className="quick-form glass-card" onSubmit={create}>
      {placeholders.map(field=><label key={field}>{field.replaceAll('_',' ')}<input required name={field}/></label>)}
      <button className="button small tactile-btn">Save</button>
    </form>}

    {busy ? (
      <div className="module-state" style={{ display: 'block' }}>
        <div className="desktop-only">
          <SkeletonTable rows={8} cols={cols.length + 1} />
        </div>
        <div className="mobile-only">
          <div style={{ display: 'grid', gap: '16px' }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    ) : !message && !rows.length ? (
      <div className="empty-state-visual">
        <div className="empty-icon">📂</div>
        <b>No {title.toLowerCase()} yet</b>
        <p>Your institutional records will appear here.</p>
      </div>
    ) : rows.length > 0 && (
      <div className="data-wrap">
        <table className="desktop-table">
          <thead>
            <tr>
              {cols.map(col=><th key={col}>{col.replaceAll('_',' ')}</th>)}
              {table==='schools'&&superAdmin&&<th>Review</th>}
              {table==='students'&&<th>Action</th>}
              {table==='payments'&&<th>Action</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row,index)=><tr key={row.id||index}>
              {cols.map(col=><td key={col}>{String(row[col]??'—')}</td>)}
              {table==='schools'&&superAdmin&&<td>
                <button className="mini accept" onClick={()=>review(row.id,'active')}>Approve</button>
                <button className="mini reject" onClick={()=>review(row.id,'rejected')}>Reject</button>
              </td>}
              {table==='students'&&<td>
                <Link to={`/report-card/${row.id}`} className="mini accept" style={{marginRight: '5px'}}>Report Card</Link>
              </td>}
              {table==='assignments'&&profile?.role==='student'&&<td><Link to={`/submit/${row.id}`} className="mini accept">Submit Work</Link></td>}
              {table==='assignments'&&['teacher','school_admin'].includes(profile?.role)&&<td><Link to={`/review/${row.id}`} className="mini accept">View Submissions</Link></td>}
              {table==='payments'&&<td>
                <Link to={`/invoice/${row.id}`} className="mini accept" style={{marginRight: '5px', backgroundColor: '#3b82f6'}}>Invoice</Link>
                {row.status==='pending'&&<button className="button small" onClick={()=>setPayingRow(row)}>Pay Now</button>}
              </td>}
              <td>
                <button className="mini reject tactile-btn" onClick={() => { setRowToDelete(row); setConfirmOpen(true); }}>Delete</button>
              </td>
            </tr>)}
          </tbody>
        </table>

        <div className="mobile-card-list">
          {filteredRows.map((row, index) => (
            <div key={row.id || index} className="data-card glass-card neumorph-flat tactile-btn">
              {cols.map(col => (
                <div key={col} className="card-field">
                  <small>{col.replaceAll('_', ' ')}</small>
                  <b>{String(row[col] ?? '—')}</b>
                </div>
              ))}
              <div className="card-actions">
                {table==='schools'&&superAdmin&&<div className="flex-actions">
                  <button className="mini accept" onClick={()=>review(row.id,'active')}>Approve</button>
                  <button className="mini reject" onClick={()=>review(row.id,'rejected')}>Reject</button>
                </div>}
                {table==='students'&&<>
                  <Link to={`/report-card/${row.id}`} className="button small full" style={{marginBottom: '5px'}}>View Report Card</Link>
                </>}
                {table==='assignments'&&profile?.role==='student'&&<Link to={`/submit/${row.id}`} className="button small full">Submit Work</Link>}
                {table==='assignments'&&['teacher','school_admin'].includes(profile?.role)&&<Link to={`/review/${row.id}`} className="button small full">View Submissions</Link>}
                {table==='payments'&&<>
                  <Link to={`/invoice/${row.id}`} className="button small full" style={{marginBottom: '5px', backgroundColor: '#3b82f6'}}>View Invoice</Link>
                  {row.status==='pending'&&<button className="button small full" onClick={()=>setPayingRow(row)}>Pay Now</button>}
                </>}
                <button className="button small full reject tactile-btn" style={{ marginTop: '5px' }} onClick={() => { setRowToDelete(row); setConfirmOpen(true); }}>Delete Record</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {payingRow && <PaymentFlow payment={payingRow} onClose={()=>setPayingRow(null)} onSuccess={handlePaymentSuccess} />}

    <ConfirmShield
      isOpen={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      onConfirm={deleteRow}
      title={`Delete ${title.slice(0, -1)}?`}
      message={`Are you sure you want to delete this ${title.toLowerCase().slice(0, -1)}? This action is permanent and will be logged in the Security Audit Trail.`}
    />
  </section>
}
