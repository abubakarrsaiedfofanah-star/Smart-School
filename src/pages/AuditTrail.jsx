import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const AuditTrail = () => {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ table_name: '', action: '' });
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    if (profile) {
      fetchLogs();
    }
  }, [profile, filters.table_name, filters.action]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (!supabase) {
        // Mock data for demo/development if supabase is missing
        setLogs([
          {
            id: '1',
            created_at: new Date().toISOString(),
            action: 'UPDATE',
            table_name: 'students',
            record_id: 'std_001',
            old_data: { name: 'John Doe', grade: 'A' },
            new_data: { name: 'John Doe', grade: 'A+' },
            actor: { full_name: 'Admin User', role: 'school_admin' }
          },
          {
            id: '2',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            action: 'DELETE',
            table_name: 'invoices',
            record_id: 'inv_452',
            old_data: { amount: 500, status: 'pending' },
            new_data: null,
            actor: { full_name: 'Super System', role: 'super_admin' }
          }
        ]);
        return;
      }

      let query = supabase
        .from('audit_logs')
        .select(`
          id,
          created_at,
          action,
          table_name,
          record_id,
          old_data,
          new_data,
          actor_id
        `)
        .order('created_at', { ascending: false });

      if (profile.role === 'school_admin') {
        query = query.eq('school_id', profile.school_id);
      }

      if (filters.table_name) {
        query = query.ilike('table_name', `%${filters.table_name}%`);
      }

      if (filters.action) {
        query = query.eq('action', filters.action);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      // Fetch actor profiles for the logs
      const actorIds = [...new Set(data.map(log => log.actor_id))].filter(Boolean);
      let actorsMap = {};

      if (actorIds.length > 0) {
        const { data: actors, error: actorsError } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', actorIds);

        if (!actorsError && actors) {
          actorsMap = actors.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {});
        }
      }

      const logsWithActors = data.map(log => ({
        ...log,
        actor: actorsMap[log.actor_id] || { full_name: 'Unknown User', role: 'N/A' }
      }));

      setLogs(logsWithActors);
    } catch (err) {
      toast.error('Failed to load security logs');
      console.error('Audit Load Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'INSERT': return '#00f2ff'; // Electric Cyan
      case 'UPDATE': return '#3b82f6'; // Bright Blue
      case 'DELETE': return '#ff0055'; // Neon Red
      default: return '#94a3b8';
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.titleGroup}>
          <div style={styles.securityBadge}>SECURED</div>
          <h1 style={styles.title}>System Audit Log</h1>
          <p style={styles.subtitle}>Immutable Security Ledger & Data Integrity Monitor</p>
        </div>
        <button onClick={fetchLogs} style={styles.refreshBtn}>
          RESCAN SYSTEM
        </button>
      </header>

      {/* Control Panel */}
      <div style={styles.controlPanel}>
        <div style={styles.filterGroup}>
          <label style={styles.label}>SECTOR (TABLE)</label>
          <input
            type="text"
            placeholder="Search records..."
            value={filters.table_name}
            onChange={(e) => setFilters(prev => ({ ...prev, table_name: e.target.value }))}
            style={styles.input}
          />
        </div>
        <div style={{ width: '220px' }}>
          <label style={styles.label}>ACTION PROTOCOL</label>
          <select
            value={filters.action}
            onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
            style={styles.select}
          >
            <option value="">ALL PROTOCOLS</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
      </div>

      {/* Industrial Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>TIMESTAMP</th>
              <th style={styles.th}>ACTOR / OPERATIVE</th>
              <th style={styles.th}>PROTOCOL</th>
              <th style={styles.th}>SECTOR</th>
              <th style={styles.th}>RECORD HASH/ID</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={styles.loadingCell}>
                  <div className="scanner-line"></div>
                  DECRYPTING AUDIT DATA...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="6" style={styles.emptyCell}>
                  NO SECURITY EVENTS DETECTED IN THIS PARAMETER.
                </td>
              </tr>
            ) : logs.map(log => (
              <React.Fragment key={log.id}>
                <tr
                  onClick={() => toggleExpand(log.id)}
                  style={{
                    ...styles.tr,
                    backgroundColor: expandedRow === log.id ? 'rgba(35, 117, 225, 0.1)' : 'transparent'
                  }}
                >
                  <td style={styles.td}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={styles.td}>
                    <div style={styles.actorName}>{log.actor?.full_name}</div>
                    <div style={styles.actorRole}>{log.actor?.role?.replace('_', ' ')}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      color: getActionColor(log.action),
                      borderColor: getActionColor(log.action)
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={styles.tdSector}>{log.table_name}</td>
                  <td style={styles.tdId}>{log.record_id}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <span style={{ color: '#2375e1', fontSize: '1.2rem' }}>
                      {expandedRow === log.id ? '[-]' : '[+]'}
                    </span>
                  </td>
                </tr>
                {expandedRow === log.id && (
                  <tr>
                    <td colSpan="6" style={styles.expandedContent}>
                      <div style={styles.jsonGrid}>
                        <div style={styles.jsonBox}>
                          <header style={styles.jsonHeader}>
                            <span style={{ color: '#ff0055' }}>PRE-STATE</span>
                            <small>JSON OBJECT</small>
                          </header>
                          <pre style={styles.pre}>
                            {log.old_data ? JSON.stringify(log.old_data, null, 2) : '// NO PREVIOUS DATA'}
                          </pre>
                        </div>
                        <div style={styles.jsonBox}>
                          <header style={styles.jsonHeader}>
                            <span style={{ color: '#00f2ff' }}>POST-STATE</span>
                            <small>JSON OBJECT</small>
                          </header>
                          <pre style={styles.pre}>
                            {log.new_data ? JSON.stringify(log.new_data, null, 2) : '// RECORD PURGED'}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        .scanner-line {
          position: absolute;
          left: 0;
          width: 100%;
          height: 2px;
          background: #2375e1;
          box-shadow: 0 0 15px #2375e1;
          animation: scan 2s linear infinite;
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    padding: '40px max(24px, calc((100vw - 1200px)/2))',
    background: '#0a0f18',
    minHeight: '100vh',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif"
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: '40px',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '24px'
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  securityBadge: {
    width: 'fit-content',
    background: 'rgba(35, 117, 225, 0.2)',
    color: '#2375e1',
    fontSize: '0.65rem',
    fontWeight: '900',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid #2375e1',
    letterSpacing: '1px'
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: '900',
    margin: 0,
    color: '#fff',
    letterSpacing: '-1px'
  },
  subtitle: {
    color: '#64748b',
    margin: 0,
    fontSize: '0.9rem'
  },
  refreshBtn: {
    background: 'transparent',
    color: '#2375e1',
    border: '1px solid #2375e1',
    padding: '10px 20px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    letterSpacing: '1px'
  },
  controlPanel: {
    display: 'flex',
    gap: '20px',
    marginBottom: '30px',
    background: '#101726',
    padding: '24px',
    borderRadius: '8px',
    border: '1px solid #1e293b'
  },
  filterGroup: {
    flex: 1
  },
  label: {
    display: 'block',
    fontSize: '0.65rem',
    fontWeight: '900',
    color: '#2375e1',
    marginBottom: '10px',
    letterSpacing: '1.5px'
  },
  input: {
    width: '100%',
    background: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#fff',
    padding: '12px 16px',
    borderRadius: '6px',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  select: {
    width: '100%',
    background: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#fff',
    padding: '12px 16px',
    borderRadius: '6px',
    fontSize: '0.9rem',
    outline: 'none'
  },
  tableWrapper: {
    background: '#101726',
    borderRadius: '8px',
    border: '1px solid #1e293b',
    overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '16px 24px',
    background: '#0f172a',
    color: '#64748b',
    fontSize: '0.7rem',
    fontWeight: '900',
    letterSpacing: '1px',
    borderBottom: '1px solid #1e293b'
  },
  tr: {
    borderBottom: '1px solid #1e293b',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  td: {
    padding: '20px 24px',
    fontSize: '0.875rem'
  },
  actorName: {
    fontWeight: '700',
    color: '#fff'
  },
  actorRole: {
    fontSize: '0.7rem',
    color: '#64748b',
    textTransform: 'uppercase',
    marginTop: '2px'
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '0.65rem',
    fontWeight: '900',
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid',
    letterSpacing: '0.5px'
  },
  tdSector: {
    padding: '20px 24px',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#94a3b8',
    fontSize: '0.8rem'
  },
  tdId: {
    padding: '20px 24px',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#475569',
    fontSize: '0.75rem'
  },
  loadingCell: {
    padding: '60px',
    textAlign: 'center',
    color: '#2375e1',
    letterSpacing: '4px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    position: 'relative'
  },
  emptyCell: {
    padding: '60px',
    textAlign: 'center',
    color: '#475569',
    fontSize: '0.9rem'
  },
  expandedContent: {
    background: '#0a0f18',
    padding: '30px'
  },
  jsonGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '30px'
  },
  jsonBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  jsonHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.65rem',
    fontWeight: '900',
    letterSpacing: '1px'
  },
  pre: {
    margin: 0,
    background: '#101726',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #1e293b',
    fontSize: '0.8rem',
    lineHeight: '1.5',
    overflow: 'auto',
    maxHeight: '300px',
    color: '#94a3b8',
    fontFamily: "'JetBrains Mono', monospace"
  }
};

export default AuditTrail;
