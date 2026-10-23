import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PaymentFlow from './PaymentFlow'
import Skeleton, { SkeletonTable, SkeletonCard } from './Skeleton'

import { Link } from 'react-router-dom'
import { classLabel, educationLevels } from '../lib/educationLevels'

const labels={schools:'Schools',profiles:'People',students:'Students',classes:'Classes',subjects:'Subjects',attendance:'Attendance',assignments:'Assignments',exams:'Exams',results:'Results',fees:'Fees',payments:'Payments',announcements:'Announcements',events:'Events',messages:'Messages',subscriptions:'Subscriptions'}
const fields={schools:['name','status','subscription_plan'],profiles:['full_name','role'],students:['student_registration_id','full_name','education_stage','class_id','admission_number'],classes:['name','education_stage','teacher_id'],subjects:['name','code','education_stages'],attendance:['student','attendance_date','status'],assignments:['title','due_date','status'],exams:['name','exam_date','academic_year','term','max_score'],results:['student','score','remarks'],fees:['name','amount','due_date'],payments:['reference','amount','status'],announcements:['title','body','class_id','created_at'],events:['title','event_date'],messages:['body','created_at'],subscriptions:['plan','status']}

export default function ModulePanel({table,profile,superAdmin=false,studentId=null}){
  const [rows,setRows]=useState([]),[classOptions,setClassOptions]=useState([]),[teacherOptions,setTeacherOptions]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[form,setForm]=useState(false),[editingExam,setEditingExam]=useState(null),[editingSubject,setEditingSubject]=useState(null),[payingRow,setPayingRow]=useState(null),[searchTerm,setSearchTerm]=useState('')

  const classScopedSubjects=table==='subjects'&&['teacher','student','parent'].includes(profile?.role)
  const cols=classScopedSubjects?['name','code','class_name','education_stage']:fields[table]||[],title=labels[table]||table

  // The shared dashboard table is read-only by default. Only these school
  // setup records have complete, role-safe forms here; other writes use their
  // dedicated workflows with the required class, learner, and approval scope.
  const canAddRecord = (profile?.role === 'school_admin' && ['students', 'classes', 'subjects', 'fees', 'announcements'].includes(table)) || (profile?.role === 'teacher' && table === 'announcements')

  const filteredRows = rows.filter(row =>
    Object.values(row).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const displayValue=(row,col)=>col==='class_id'?(row.class_id?classLabel(classOptions.find(item=>item.id===row.class_id)||{name:'Class'}):table==='announcements'?'Whole school':'Not assigned'):col==='education_stage'?(educationLevels.find(item=>item.stage===(row.education_stage||classOptions.find(item=>item.id===row.class_id)?.education_stage))?.label||'Other'):col==='education_stages'?(row.education_stages||[]).map(stage=>educationLevels.find(item=>item.stage===stage)?.label||stage).join(', '):col==='teacher_id'?(teacherOptions.find(person=>person.id===row.teacher_id)?.full_name||'No class teacher assigned'):String(row[col]??'—')

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

  const load=async()=>{setBusy(true);setMessage('');try{if(!supabase)return;let data,error;let selectedChildClassId=null;if(profile?.role==='parent'&&studentId){const child=await supabase.from('students').select('class_id').eq('id',studentId).eq('school_id',profile.school_id).maybeSingle();if(child.error)throw child.error;selectedChildClassId=child.data?.class_id||null}if(classScopedSubjects){let query=supabase.from('teacher_subject_assignments').select('id,teacher_id,subject_id,class_id,subjects!inner(id,name,code),classes!inner(id,name,grade,education_stage)').eq('school_id',profile.school_id).order('created_at',{ascending:false});if(profile?.role==='parent')query=selectedChildClassId?query.eq('class_id',selectedChildClassId):query.eq('class_id','00000000-0000-0000-0000-000000000000');const result=await query;data=(result.data||[]).map(row=>({id:row.id,name:row.subjects?.name,code:row.subjects?.code,class_name:row.classes?.name,education_stage:row.classes?.education_stage}));error=result.error}else{let query=supabase.from(table).select('*').limit(50);if(profile?.school_id&&table!=='schools')query=query.eq('school_id',profile.school_id);if(table==='schools'&&!superAdmin&&profile?.school_id)query=query.eq('id',profile.school_id);if(profile?.role==='parent'){if(table==='students')query=query.eq('id',studentId||'00000000-0000-0000-0000-000000000000');else if(['attendance','results','payments','submissions','quiz_results'].includes(table))query=studentId?query.eq('student_id',studentId):query.eq('student_id','00000000-0000-0000-0000-000000000000');else if(['assignments','exams','timetable'].includes(table))query=selectedChildClassId?query.eq('class_id',selectedChildClassId):query.eq('class_id','00000000-0000-0000-0000-000000000000');else if(table==='announcements')query=query.or(`class_id.is.null,class_id.eq.${studentId?selectedChildClassId||'00000000-0000-0000-0000-000000000000':'00000000-0000-0000-0000-000000000000'}`)}const result=await query;data=result.data;error=result.error}if(error)throw error;if(table==='classes')data=groupClasses(data||[]).flatMap(group=>group.classes);setRows(data||[]);if(['announcements','students','classes'].includes(table)&&profile?.school_id){const result=await supabase.from('classes').select('id,name,grade,education_stage,level_order').eq('school_id',profile.school_id).order('name');if(result.error)throw result.error;setClassOptions(result.data||[])}if(table==='classes'&&profile?.school_id){const result=await supabase.from('profiles').select('id,full_name,email').eq('school_id',profile.school_id).eq('role','teacher').eq('is_active',true).order('full_name');if(result.error)throw result.error;setTeacherOptions(result.data||[])}}catch(error){setMessage(error.message||'Could not load this module.')}finally{setBusy(false)}}
  useEffect(()=>{load()},[table,profile?.id,profile?.role,profile?.school_id,studentId])
  const placeholders=useMemo(()=>table==='exams'?cols.filter(field=>!['status','created_at'].includes(field)):table==='classes'?[]:table==='students'?['admission_number','full_name']:table==='announcements'?['title','body']:table==='subjects'?['name','code']:cols.filter(field=>!['status','created_at'].includes(field)).slice(0,3),[table])
  async function create(event){event.preventDefault();setMessage('');const formData=new FormData(event.currentTarget);const values=Object.fromEntries(formData);try{
    if(!supabase)return;const payload={...values};if(profile?.school_id&&table!=='schools')payload.school_id=profile.school_id;if(table==='classes'){const [stage,order]=String(values.level_order||'').split(':');const level=Number(order);const group=educationLevels.find(item=>item.stage===stage);const name=group?.levels[level-1];if(!name)throw new Error('Choose a valid class level.');payload.education_stage=stage;payload.name=name;payload.grade=name;payload.level_order=level;payload.teacher_id=values.teacher_id||null}if(table==='subjects'){payload.education_stages=formData.getAll('education_stages');if(!payload.education_stages.length)throw new Error('Choose at least one education stage for this subject.')}if(table==='students'&&!payload.class_id)throw new Error('Choose the learner’s current class or level.');if(table==='announcements'){payload.created_by=profile.id;if(values.class_id==='schoolwide')payload.class_id=null;if(profile.role==='teacher'&&!payload.class_id)throw new Error('Teachers must choose one of their assigned classes.')}if(table==='assignments')payload.published_at=new Date().toISOString();if(table==='exams')payload.published=true;const result=table==='exams'&&editingExam?await supabase.from(table).update(payload).eq('id',editingExam.id).eq('school_id',profile.school_id):table==='subjects'&&editingSubject?await supabase.from(table).update({name:payload.name,code:payload.code,education_stages:payload.education_stages}).eq('id',editingSubject.id).eq('school_id',profile.school_id):await supabase.from(table).insert(payload);if(result.error)throw result.error;setForm(false);setEditingExam(null);setEditingSubject(null);load()}catch(error){setMessage(error.message||'Could not save this record.')}}
  async function review(id,status){try{const {error}=await supabase.rpc('review_school',{target_school:id,new_status:status});if(error)throw error;load()}catch(error){setMessage(error.message||'Could not update the school.')}}
  return <section className="panel module glass-card page-transition">
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{busy?'Loading records…':`${filteredRows.length} record${filteredRows.length===1?'':'s'} available`}</p>
        {classScopedSubjects&&<small>{profile?.role==='teacher'?'Showing only the subjects assigned to you, with their classes.':'Showing subjects assigned to your class or your linked children’s classes.'}</small>}
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
          <button className="outline tactile-btn" onClick={exportCSV} style={{marginRight: '10px'}}>Export CSV</button>
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
        {canAddRecord&&<button className="button small tactile-btn" onClick={()=>{setEditingExam(null);setEditingSubject(null);setForm(!form)}}>Add {title.replace(/s$/,'')} +</button>}
        <button className="outline tactile-btn" onClick={load} disabled={busy}>Refresh</button>
      </div>
    </div>

    {message&&<p className="error">{message}</p>}
    {form&&<form key={editingExam?.id || editingSubject?.id || 'new-record'} className="quick-form glass-card" onSubmit={create}>
      {editingSubject&&<h3>Update education stages for {editingSubject.name}</h3>}
      {table==='classes'&&<label>Class or level<select required name="level_order" defaultValue=""><option value="">Choose a level</option>{educationLevels.map(group=><optgroup key={group.stage} label={group.label}>{group.levels.map((level,index)=><option key={level} value={`${group.stage}:${index+1}`}>{level}</option>)}</optgroup>)}</select><small>Only the levels used by this school need to be added.</small></label>}
      {table==='classes'&&<label>Class teacher<select name="teacher_id" defaultValue=""><option value="">Assign later (optional)</option>{teacherOptions.map(person=><option key={person.id} value={person.id}>{person.full_name||person.email}</option>)}</select><small>For secondary classes, assign each subject teacher separately on the teaching assignments page.</small></label>}
      {table==='subjects'&&<fieldset style={{border:'1px solid var(--line)',borderRadius:10,padding:14}}><legend>Education stages for this subject</legend><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>{educationLevels.map(stage=><label key={stage.stage} style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" name="education_stages" value={stage.stage} defaultChecked={editingSubject?.education_stages?.includes(stage.stage)}/>{stage.label}</label>)}</div><small>Teachers can only be assigned this subject in classes at the selected stages.</small></fieldset>}
      {table==='students'&&<label>Class or level<select required name="class_id" defaultValue=""><option value="">Choose learner’s current class</option>{groupClasses(classOptions).map(group=><optgroup key={group.stage} label={group.label}>{group.classes.map(item=><option key={item.id} value={item.id}>{classLabel(item)}</option>)}</optgroup>)}</select>{!classOptions.length&&<small>Add the school’s classes and levels before creating student records.</small>}</label>}
      {placeholders.map(field=><label key={field}>{field==='body'?'Message':field.replaceAll('_',' ')}{field==='body'?<textarea required name={field} rows="4" maxLength="5000" />:<input required name={field} type={field==='exam_date'?'date':field==='max_score'?'number':'text'} min={field==='max_score'?'1':undefined} maxLength={field==='term'?40:undefined} step={field==='max_score'?'any':undefined} defaultValue={editingExam?.[field] ?? editingSubject?.[field] ?? ''} placeholder={field==='academic_year'?'e.g. 2026/2027':field==='term'?'e.g. Term 1 or Semester 1':undefined}/>}</label>)}
      {table==='announcements'&&<label>Audience<select required name="class_id" defaultValue={profile?.role==='school_admin'?'schoolwide':''}>{profile?.role==='teacher'&&<option value="" disabled>Choose assigned class</option>}{profile?.role==='school_admin'&&<option value="schoolwide">Whole school</option>}{classOptions.map(row=><option key={row.id} value={row.id}>{row.name}{row.grade && row.grade!==row.name?` · ${row.grade}`:''}</option>)}</select><small>Class posts are visible only to that class, its assigned teachers, and linked parents.</small></label>}
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
              {table==='subjects'&&profile?.role==='school_admin'&&<th>Actions</th>}
              {table==='payments'&&<th>Action</th>}
              {table==='exams'&&profile?.role==='school_admin'&&<th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row,index)=><tr key={row.id||index}>
              {cols.map(col=><td key={col}>{displayValue(row,col)}</td>)}
              {table==='schools'&&superAdmin&&<td>
                <button className="mini accept" onClick={()=>review(row.id,'active')}>Approve</button>
                <button className="mini reject" onClick={()=>review(row.id,'rejected')}>Reject</button>
              </td>}
              {table==='students'&&<td>
                <Link to={`/report-card/${row.id}`} className="mini accept" style={{marginRight: '5px'}}>Report Card</Link>
              </td>}
              {table==='subjects'&&profile?.role==='school_admin'&&<td><button className="mini accept" onClick={()=>{setEditingSubject(row);setEditingExam(null);setForm(true)}}>Edit stages</button></td>}
              {table==='assignments'&&profile?.role==='student'&&<td><Link to={`/submit/${row.id}`} className="mini accept">Submit Work</Link></td>}
              {table==='assignments'&&['teacher','school_admin'].includes(profile?.role)&&<td><Link to={`/review/${row.id}`} className="mini accept">View Submissions</Link></td>}
              {table==='payments'&&<td>
                <Link to={`/invoice/${row.id}`} className="mini accept" style={{marginRight: '5px', backgroundColor: '#3b82f6'}}>Invoice</Link>
                {row.status==='pending'&&<button className="button small" onClick={()=>setPayingRow(row)}>Pay Now</button>}
              </td>}
              {table==='exams'&&profile?.role==='school_admin'&&<td><button className="mini accept tactile-btn" onClick={()=>{setEditingExam(row);setForm(true)}}>Edit period</button></td>}
            </tr>)}
          </tbody>
        </table>

        <div className="mobile-card-list">
          {filteredRows.map((row, index) => (
            <div key={row.id || index} className="data-card glass-card neumorph-flat tactile-btn">
              {cols.map(col => (
                <div key={col} className="card-field">
                <small>{col.replaceAll('_', ' ')}</small>
                <b>{displayValue(row,col)}</b>
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
                {table==='subjects'&&profile?.role==='school_admin'&&<button className="button small full" onClick={()=>{setEditingSubject(row);setEditingExam(null);setForm(true)}}>Edit stages</button>}
                {table==='assignments'&&profile?.role==='student'&&<Link to={`/submit/${row.id}`} className="button small full">Submit Work</Link>}
                {table==='assignments'&&['teacher','school_admin'].includes(profile?.role)&&<Link to={`/review/${row.id}`} className="button small full">View Submissions</Link>}
                {table==='payments'&&<>
                  <Link to={`/invoice/${row.id}`} className="button small full" style={{marginBottom: '5px', backgroundColor: '#3b82f6'}}>View Invoice</Link>
                  {row.status==='pending'&&<button className="button small full" onClick={()=>setPayingRow(row)}>Pay Now</button>}
                </>}
                {table==='exams'&&profile?.role==='school_admin'&&<button className="button small full" onClick={()=>{setEditingExam(row);setForm(true)}}>Edit academic period</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {payingRow && <PaymentFlow payment={payingRow} onClose={()=>setPayingRow(null)} />}

  </section>
}
