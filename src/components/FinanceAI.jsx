import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { formatCurrency } from '../lib/formatters';

/**
 * FinanceAI Component
 * Automated financial intelligence dashboard card for SmartSchool Enterprise Finance.
 */
const FinanceAI = () => {
  const { profile, school, demo } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchFinancialData();
  }, [profile?.school_id, demo]);

  const fetchFinancialData = async () => {
    if (demo || !supabase || !profile?.school_id) { setStats(null); setLoading(false); return }
    setStats(null);
    setLoading(true);

    try {
      {
        const { data, error } = await supabase
          .from('payments')
          .select(`
            amount,
            status,
            student:students (
              admission_number,
              profile:profiles (full_name)
            )
          `)
          .eq('school_id', profile.school_id)
          .eq('status', 'pending');

        if (error) throw error;

        const rows = data || [];
        const total = rows.reduce((sum, item) => sum + Number(item.amount), 0);
        const uniqueDebtors = Array.from(new Set(rows.map(d => d.student?.profile?.full_name || 'Unknown Student')));

        setStats({
          totalOutstanding: total,
          debtorCount: uniqueDebtors.length,
          debtors: rows.map(d => ({
            name: d.student?.profile?.full_name || 'Unknown',
            amount: d.amount
          })).slice(0, 5) // Just show top 5 for the card
        });
      }
    } catch (err) {
      console.error('FinanceAI Fetch Error:', err);
      toast.error('Failed to load financial intelligence');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="finance-ai-card" style={styles.card}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>FINANCE</div>
        <h3 style={styles.title}>Payment overview</h3>
      </div>

      <div style={styles.body}>
        <div style={styles.statContainer}>
          <div style={styles.statLabel}>Total Outstanding School-wide</div>
          <div style={styles.statValue}>
            {stats ? <><span style={styles.currency}>{school?.currency_code || 'KES'}</span> {stats.totalOutstanding.toLocaleString()}</> : 'Unavailable'}
          </div>
          <div style={styles.statSubtext}>
            {stats ? 'Pending payments' : 'Connect a school account to load payment data.'}
          </div>
        </div>

        <div style={styles.debtorList}>
          <div style={styles.listHeader}>Top Priority Collections</div>
          {loading ? (
            <div style={styles.loading}>Analyzing ledger...</div>
          ) : stats?.debtors.length > 0 ? (
            stats.debtors.slice(0, 3).map((debtor, i) => (
              <div key={i} style={styles.debtorItem}>
                <span style={styles.debtorName}>{debtor.name}</span>
                <span style={styles.debtorAmount}>{formatCurrency(debtor.amount, school?.currency_code)}</span>
              </div>
            ))
          ) : (
            <div style={styles.empty}>{stats ? 'No outstanding payments found.' : 'Payment records are unavailable.'}</div>
          )}
        </div>
      </div>

      <div style={styles.footer}><div style={styles.securityNote}>Payment data comes from the connected school ledger.</div></div>
    </div>
  );
};

const styles = {
  card: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    borderRadius: '16px',
    padding: '24px',
    color: '#f8fafc',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(35, 117, 225, 0.2)',
    maxWidth: '400px',
    fontFamily: "'Inter', sans-serif",
    position: 'relative',
    overflow: 'hidden'
  },
  header: {
    marginBottom: '20px',
    position: 'relative',
    zIndex: 2
  },
  eyebrow: {
    fontSize: '0.7rem',
    fontWeight: '800',
    color: '#3b82f6',
    letterSpacing: '0.1em',
    marginBottom: '4px'
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: '700',
    margin: 0,
    color: '#fff'
  },
  body: {
    marginBottom: '24px',
    position: 'relative',
    zIndex: 2
  },
  statContainer: {
    background: 'rgba(30, 41, 59, 0.5)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    borderLeft: '4px solid #2563eb'
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginBottom: '8px'
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#fff',
    display: 'flex',
    alignItems: 'baseline'
  },
  currency: {
    fontSize: '0.875rem',
    color: '#3b82f6',
    marginRight: '6px'
  },
  statSubtext: {
    fontSize: '0.7rem',
    color: '#10b981',
    marginTop: '4px',
    fontWeight: '600'
  },
  trendIcon: {
    marginRight: '2px'
  },
  debtorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  listHeader: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  debtorItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
  },
  debtorName: {
    color: '#e2e8f0'
  },
  debtorAmount: {
    fontWeight: '600',
    color: '#f1f5f9'
  },
  loading: {
    fontSize: '0.8rem',
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '10px'
  },
  empty: {
    fontSize: '0.8rem',
    color: '#10b981',
    textAlign: 'center',
    padding: '10px'
  },
  footer: {
    position: 'relative',
    zIndex: 2
  },
  button: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    fontWeight: '700',
    fontSize: '0.9rem',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  },
  securityNote: {
    fontSize: '0.65rem',
    color: '#475569',
    marginTop: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};

export default FinanceAI;
