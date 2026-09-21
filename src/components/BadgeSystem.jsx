import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * BadgeSystem Component
 * Renders a gallery of circular badges for a student.
 * Earned badges glow gold, locked badges are grayscale.
 */
const BadgeSystem = ({ studentId }) => {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState(null);

  useEffect(() => {
    const fetchBadgeData = async () => {
      if (!studentId || !supabase) return;

      setLoading(true);
      try {
        // Fetch all possible badges
        const { data: allBadges, error: allErr } = await supabase
          .from('badges')
          .select('*');

        if (allErr) throw allErr;

        // Fetch badges earned by this student
        const { data: earnedData, error: earnedErr } = await supabase
          .from('student_badges')
          .select('badge_id, earned_at')
          .eq('student_id', studentId);

        if (earnedErr) throw earnedErr;

        const earnedMap = new Map(earnedData.map(item => [item.badge_id, item.earned_at]));

        const combined = allBadges.map(b => ({
          ...b,
          isEarned: earnedMap.has(b.id),
          earnedAt: earnedMap.get(b.id)
        }));

        setBadges(combined);
      } catch (error) {
        console.error('Error fetching badges:', error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBadgeData();
  }, [studentId]);

  if (loading) {
    return (
      <div className="badge-loading">
        <div className="spinner"></div>
        <p>Polishing your achievements...</p>
      </div>
    );
  }

  return (
    <div className="badge-system-container">
      <style>{`
        .badge-system-container {
          padding: 2rem;
          background: rgba(10, 20, 40, 0.6);
          border-radius: 20px;
          border: 1px solid rgba(0, 123, 255, 0.3);
          backdrop-filter: blur(10px);
          color: #fff;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .badge-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 2rem;
          justify-items: center;
        }

        .badge-item {
          position: relative;
          cursor: pointer;
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .badge-item:hover {
          transform: scale(1.1) translateY(-5px);
        }

        .badge-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid #333;
          position: relative;
          overflow: hidden;
        }

        .badge-icon {
          width: 60%;
          height: 60%;
          object-fit: contain;
        }

        /* Earned State: Gold Glow */
        .badge-earned .badge-circle {
          border-color: #ffd700;
          box-shadow: 0 0 15px rgba(255, 215, 0, 0.4), inset 0 0 10px rgba(255, 215, 0, 0.2);
          animation: gold-pulse 2s infinite alternate;
        }

        .badge-earned .badge-icon {
          filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.5));
        }

        /* Locked State: Grayscale */
        .badge-locked .badge-circle {
          filter: grayscale(1) opacity(0.5);
          border-color: #444;
        }

        .badge-name {
          font-size: 0.8rem;
          font-weight: 600;
          text-align: center;
          color: #a0c4ff; /* Electric Blue tint */
        }

        @keyframes gold-pulse {
          0% { box-shadow: 0 0 10px rgba(255, 215, 0, 0.3); }
          100% { box-shadow: 0 0 25px rgba(255, 215, 0, 0.7); }
        }

        /* Modal Styles */
        .badge-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.3s ease;
        }

        .badge-modal-content {
          background: linear-gradient(135deg, #051937, #004d7a, #008793, #00bf72);
          background: #0d1b2a;
          border: 2px solid #007bff;
          padding: 2.5rem;
          border-radius: 24px;
          max-width: 400px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 50px rgba(0, 123, 255, 0.4);
          position: relative;
        }

        .modal-close {
          position: absolute;
          top: 15px;
          right: 15px;
          background: none;
          border: none;
          color: #fff;
          font-size: 1.5rem;
          cursor: pointer;
        }

        .modal-badge-large {
          width: 120px;
          height: 120px;
          margin: 0 auto 1.5rem;
          border-radius: 50%;
          background: #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 4px solid #ffd700;
          box-shadow: 0 0 30px rgba(255, 215, 0, 0.5);
        }

        .modal-title {
          font-size: 1.8rem;
          margin-bottom: 0.5rem;
          color: #fff;
        }

        .modal-desc {
          color: #ccd6f6;
          line-height: 1.6;
          margin-bottom: 1.5rem;
        }

        .modal-date {
          font-size: 0.9rem;
          color: #ffd700;
          font-style: italic;
        }

        .badge-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 3rem;
          color: #007bff;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(0, 123, 255, 0.1);
          border-top: 4px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <h2 style={{ color: '#007bff', marginBottom: '1.5rem', textAlign: 'center' }}>Achievement Gallery</h2>

      <div className="badge-grid">
        {badges.map(badge => (
          <div
            key={badge.id}
            className={`badge-item ${badge.isEarned ? 'badge-earned' : 'badge-locked'}`}
            onClick={() => setSelectedBadge(badge)}
          >
            <div className="badge-circle">
              <img
                src={badge.icon_url || 'https://cdn-icons-png.flaticon.com/512/190/190411.png'}
                alt={badge.name}
                className="badge-icon"
              />
            </div>
            <span className="badge-name">{badge.name}</span>
          </div>
        ))}
      </div>

      {selectedBadge && (
        <div className="badge-modal-overlay" onClick={() => setSelectedBadge(null)}>
          <div className="badge-modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedBadge(null)}>&times;</button>

            <div className={`modal-badge-large ${!selectedBadge.isEarned ? 'badge-locked' : ''}`}>
               <img
                src={selectedBadge.icon_url || 'https://cdn-icons-png.flaticon.com/512/190/190411.png'}
                alt={selectedBadge.name}
                className="badge-icon"
                style={{ width: '70%', height: '70%' }}
              />
            </div>

            <h3 className="modal-title">{selectedBadge.name}</h3>
            <p className="modal-desc">{selectedBadge.description}</p>

            {selectedBadge.isEarned ? (
              <p className="modal-date">
                Earned on {new Date(selectedBadge.earnedAt).toLocaleDateString()}
              </p>
            ) : (
              <p style={{ color: '#888' }}>Keep working to unlock this achievement!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BadgeSystem;
