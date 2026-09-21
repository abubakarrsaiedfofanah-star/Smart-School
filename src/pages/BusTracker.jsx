import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import '../styles/blue-theme.css';

const BusTracker = () => {
  const { profile } = useAuth();
  const [busData, setBusData] = useState(null);
  const [eta, setEta] = useState(12);
  const [nextStop, setNextStop] = useState("Maple Street");

  useEffect(() => {
    if (!supabase) return;

    // Initial fetch
    const fetchBus = async () => {
      const { data, error } = await supabase
        .from('bus_routes')
        .select('*')
        .eq('status', 'active')
        .limit(1)
        .single();

      if (data) setBusData(data);
    };

    fetchBus();

    // Subscribe to changes
    const subscription = supabase
      .channel('bus_location')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bus_routes' }, (payload) => {
        setBusData(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // Simple interpolation for the SVG map
  const getBusPos = () => {
    if (!busData?.last_lat) return { x: 50, y: 350 };
    // Map lat/lng to SVG coords (simulated)
    const x = (busData.last_lng + 122.42) * 5000 + 100;
    const y = (37.77 - busData.last_lat) * 5000 + 100;
    return { x, y };
  };

  const pos = getBusPos();

  return (
    <div className="bus-tracker-container" style={{ padding: '2rem', background: '#f0f9ff', minHeight: '100vh' }}>
      <style>{`
        .bus-tracker-card {
          background: white;
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 10px 25px rgba(35, 117, 225, 0.1);
          border: 1px solid rgba(35, 117, 225, 0.1);
          max-width: 800px;
          margin: 0 auto;
        }
        .map-viewport {
          width: 100%;
          height: 400px;
          background: #e0f2fe;
          border-radius: 12px;
          position: relative;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .bus-icon {
          position: absolute;
          transition: all 5s linear;
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2));
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .stat-box {
          padding: 15px;
          background: #f8fafc;
          border-radius: 12px;
          border-left: 4px solid #2375e1;
        }
        .stat-label {
          font-size: 0.75rem;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .stat-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
        }
        .route-path {
          fill: none;
          stroke: #cbd5e1;
          stroke-width: 8;
          stroke-linecap: round;
        }
        .route-path-active {
          fill: none;
          stroke: #2375e1;
          stroke-width: 8;
          stroke-dasharray: 12 12;
          animation: flow 20s linear infinite;
        }
        @keyframes flow {
          to { stroke-dashoffset: -240; }
        }
      `}</style>

      <div className="bus-tracker-card">
        <header style={{ marginBottom: '20px' }}>
          <h1 style={{ margin: 0, color: '#1e293b', fontSize: '1.5rem' }}>School Bus Real-Time Tracking</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Route: {busData?.route_name || 'Morning Express'}</p>
        </header>

        <div className="map-viewport">
          <svg width="100%" height="100%" viewBox="0 0 800 400">
            {/* Background Map Shapes */}
            <path className="route-path" d="M 50 350 Q 200 350 200 200 T 400 100 T 750 50" />
            <path className="route-path-active" d="M 50 350 Q 200 350 200 200 T 400 100 T 750 50" />

            {/* Bus Marker */}
            <g transform={`translate(${pos.x}, ${pos.y})`}>
              <circle r="12" fill="#2375e1" />
              <text y="5" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">🚌</text>
            </g>

            {/* Stops */}
            <circle cx="50" cy="350" r="6" fill="#1e293b" />
            <circle cx="750" cy="50" r="6" fill="#1e293b" />
          </svg>
        </div>

        <div className="info-grid">
          <div className="stat-box">
            <div className="stat-label">Next Stop</div>
            <div className="stat-value">{nextStop}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Estimated Arrival</div>
            <div className="stat-value">{eta} mins</div>
          </div>
        </div>

        <div style={{ marginTop: '20px', padding: '12px', background: '#ecfdf5', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '0.85rem', color: '#065f46' }}>
            {busData?.status === 'active' ? 'Bus is currently en route' : 'Bus is currently at station'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BusTracker;
