import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function AuditTrail() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ table_name: '', action: '' });

  useEffect(() => {
    if (profile) fetchLogs();
  }, [profile, filters.table_name, filters.action]);

  const fetchLogs = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase.from('audit_logs').select(`*, actor:profiles(full_name, role)`).order('created_at', { ascending: false });
      if (profile.role === 'school_admin') query = query.eq('school_id', profile.school_id);
      if (filters.table_name) query = query.ilike('table_name', `%${filters.table_name}%`);
      if (filters.action) query = query.eq('action', filters.action);

      const { data, error } = await query.limit(50);
      if (error) throw error;
      setLogs(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  return (
    <div style={{padding: '40px 24px', background: '#0a0f18', minHeight: '100vh', color: '#fff'}}>
      <p className="eyebrow">Data Integrity</p>
      <h1 style={{fontSize:'2.5rem', fontWeight:900, marginBottom:'40px'}}>System Audit Log</h1>

      <div className="glass-card neumorph-flat" style={{marginBottom:'30px', display:'flex', gap:'20px'}}>
        <input style={{flex:1}} placeholder="Sector (Table)..." value={filters.table_name} onChange={e=>setFilters({...filters, table_name:e.target.value})} />
        <select style={{width:'200px'}} value={filters.action} onChange={e=>setFilters({...filters, action:e.target.value})}>
           <option value="">All Actions</option>
           <option value="INSERT">INSERT</option>
           <option value="UPDATE">UPDATE</option>
           <option value="DELETE">DELETE</option>
        </select>
      </div>

      <div className="glass-card neumorph-flat" style={{padding:0, overflow:'hidden'}}>
        <table style={{width:'100%', borderCollapse:'collapse', textAlign:'left'}}>
          <thead style={{background:'#0f172a', fontSize:'0.7rem', color:'#64748b'}}>
            <tr><th style={{padding:'20px'}}>TIMESTAMP</th><th style={{padding:'20px'}}>ACTOR</th><th style={{padding:'20px'}}>PROTOCOL</th><th style={{padding:'20px'}}>SECTOR</th><th style={{padding:'20px'}}>ID</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="5" style={{padding:'60px', textAlign:'center'}}>DECRYPTING DATA...</td></tr> : logs.length === 0 ? <tr><td colSpan="5" style={{padding:'60px', textAlign:'center'}}>NO SECURITY EVENTS DETECTED.</td></tr> : logs.map(l => (
              <tr key={l.id} style={{borderBottom:'1px solid #1e293b', fontSize:'0.85rem'}}>
                <td style={{padding:'20px'}}>{new Date(l.created_at).toLocaleString()}</td>
                <td style={{padding:'20px'}}><b>{l.actor?.full_name}</b><br/><small style={{color:'#64748b'}}>{l.actor?.role}</small></td>
                <td style={{padding:'20px'}}><span className="badge">{l.action}</span></td>
                <td style={{padding:'20px', color:'#94a3b8'}}>{l.table_name}</td>
                <td style={{padding:'20px', color:'#475569', fontSize:'0.7rem'}}>{l.record_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
