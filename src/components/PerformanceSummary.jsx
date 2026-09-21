import React from 'react';

export default function PerformanceSummary({ role, t }) {
  const insights = {
    teacher: "AI Insight: Class 8B has completed 90% of assignments this week. Excellent engagement!",
    student: "AI Tip: Your Mathematics performance is trending upwards. Keep it up to reach an A!",
    school_admin: "Warning: Overall attendance in Grade 7B dropped by 12% today. Checking reasons...",
    parent: "Observation: Yusuf is showing strong interest in Science. Consider encouraging extra reading.",
    super_admin: "Platform Health: 3 new schools joined this week. Revenue is up by 5%."
  };

  const atRisk = (role === 'teacher' || role === 'school_admin') ? [
    { name: 'David Kimani', reason: 'Attendance dropped to 65%', action: 'Meeting needed' },
    { name: 'Sarah Wanjiru', reason: 'Declining grades in Math', action: 'Send remedial invite' }
  ] : [];

  return (
    <div className="performance-summary-card glass-card page-transition">
      <div className="ai-badge-row">
        <div className="ai-badge">SMARTSCHOOL AI 3.2</div>
        <div className="intelligence-pulse"></div>
      </div>
      <p>{insights[role] || "Ready to provide school insights."}</p>

      {atRisk.length > 0 && (
        <div className="at-risk-section">
          <div className="at-risk-header">⚠️ AI PREDICTIVE ALERT: AT-RISK STUDENTS</div>
          {atRisk.map((s, i) => (
            <div key={i} className="at-risk-item">
              <b>{s.name}</b>
              <span>{s.reason}</span>
              <button className="mini-action">{s.action}</button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .performance-summary-card {
          padding: 24px;
          margin-bottom: 30px;
          border-left: 6px solid #a855f7;
          background: linear-gradient(90deg, rgba(168, 85, 247, 0.08) 0%, transparent 100%);
          position: relative;
          overflow: hidden;
        }
        .ai-badge-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .ai-badge {
          font-size: 0.65rem;
          font-weight: 900;
          color: #a855f7;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .intelligence-pulse {
          width: 8px;
          height: 8px;
          background: #a855f7;
          border-radius: 50%;
          box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7);
          animation: intel-pulse 2s infinite;
        }
        @keyframes intel-pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(168, 85, 247, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(168, 85, 247, 0); }
        }
        .performance-summary-card p {
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--ink);
          line-height: 1.6;
          margin-bottom: 0;
        }
        .at-risk-section { margin-top: 20px; padding-top: 15px; border-top: 1px dashed rgba(168, 85, 247, 0.3); }
        .at-risk-header { font-size: 0.65rem; font-weight: 800; color: #f43f5e; margin-bottom: 12px; }
        .at-risk-item { display: flex; align-items: center; gap: 15px; font-size: 0.85rem; margin-bottom: 8px; }
        .at-risk-item b { min-width: 100px; }
        .at-risk-item span { flex: 1; color: var(--muted); }
        .mini-action { background: #a855f7; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; }
      `}</style>
    </div>
  );
}
