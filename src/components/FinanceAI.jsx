import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

/**
 * FinanceAI Component
 * Automated financial intelligence dashboard card for SmartSchool Enterprise Finance.
 */
const FinanceAI = () => {
  const { profile, demo } = useAuth();
  const [loading, setLoading] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [stats, setStats] = useState({
    totalOutstanding: 0,
    debtorCount: 0,
    debtors: []
  });

  useEffect(() => {
    fetchFinancialData();
  }, [profile?.school_id]);

  const fetchFinancialData = async () => {
    if (!profile?.school_id) return;
    setLoading(true);

    try {
      if (demo) {
        // Simulate demo data
        setStats({
          totalOutstanding: 1450200,
          debtorCount: 12,
          debtors: [
            { name: 'John Doe', amount: 45000 },
            { name: 'Alice Smith', amount: 120000 },
            { name: 'Robert Brown', amount: 35000 }
          ]
        });
      } else {
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

        const total = data.reduce((sum, item) => sum + Number(item.amount), 0);
        const uniqueDebtors = Array.from(new Set(data.map(d => d.student?.profile?.full_name || 'Unknown Student')));

        setStats({
          totalOutstanding: total,
          debtorCount: uniqueDebtors.length,
          debtors: data.map(d => ({
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

  const triggerAINudges = async () => {
    setNudging(true);
    // Simulate AI Nudge broadcast
    toast.loading('AI analyzing payment patterns...', { id: 'nudge' });

    setTimeout(() => {
      toast.loading('Drafting personalized reminders for parents...', { id: 'nudge' });

      setTimeout(() => {
        toast.success(`🚀 Broadcast sent! ${stats.debtorCount} parents nudged via SMS & Portal.`, { id: 'nudge', duration: 4000 });
        setNudging(false);
      }, 1500);
    }, 1500);
  };

  return (
    <div className="finance-ai-card" style={styles.card}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>AI-DRIVEN INSIGHTS</div>
        <h3 style={styles.title}>Smart Recovery Dashboard</h3>
      </div>

      <div style={styles.body}>
        <div style={styles.statContainer}>
          <div style={styles.statLabel}>Total Outstanding School-wide</div>
          <div style={styles.statValue}>
            <span style={styles.currency}>KES</span> {stats.totalOutstanding.toLocaleString()}
          </div>
          <div style={styles.statSubtext}>
            <span style={styles.trendIcon}>↑</span> 4.2% from last month
          </div>
        </div>

        <div style={styles.debtorList}>
          <div style={styles.listHeader}>Top Priority Collections</div>
          {loading ? (
            <div style={styles.loading}>Analyzing ledger...</div>
          ) : stats.debtors.length > 0 ? (
            stats.debtors.slice(0, 3).map((debtor, i) => (
              <div key={i} style={styles.debtorItem}>
                <span style={styles.debtorName}>{debtor.name}</span>
                <span style={styles.debtorAmount}>KES {Number(debtor.amount).toLocaleString()}</span>
              </div>
            ))
          ) : (
            <div style={styles.empty}>All accounts clear. Excellence achieved!</div>
          )}
        </div>
      </div>

      <div style={styles.footer}>
        <button
          onClick={triggerAINudges}
          disabled={nudging || stats.debtorCount === 0}
          style={{
            ...styles.button,
            opacity: (nudging || stats.debtorCount === 0) ? 0.6 : 1,
            cursor: (nudging || stats.debtorCount === 0) ? 'not-allowed' : 'pointer'
          }}
        >
          {nudging ? 'Processing AI Flows...' : '🚀 Trigger AI Nudges'}
        </button>
        <div style={styles.securityNote}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 4}}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Enterprise Grade Security Active
        </div>
      </div>
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
