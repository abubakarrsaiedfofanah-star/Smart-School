import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const DriverPortal = () => {
  const { profile } = useAuth();
  const [activeRoute, setActiveRoute] = useState(null);
  const [isDriving, setIsDriving] = useState(false);
  const intervalRef = useRef(null);

  // Simulated path coordinates
  const path = [
    { lat: 37.770, lng: -122.420 },
    { lat: 37.772, lng: -122.415 },
    { lat: 37.775, lng: -122.410 },
    { lat: 37.778, lng: -122.405 },
    { lat: 37.780, lng: -122.400 },
    { lat: 37.782, lng: -122.395 }
  ];
  const [pathIdx, setPathIdx] = useState(0);

  useEffect(() => {
    if (!supabase || !profile) return;

    const loadAssignedRoute = async () => {
      const { data, error } = await supabase
        .from('bus_routes')
        .select('*')
        .eq('driver_id', profile.id)
        .single();

      if (data) {
        setActiveRoute(data);
        setIsDriving(data.status === 'active');
      }
    };

    loadAssignedRoute();
  }, [profile]);

  const startTrip = async () => {
    if (!activeRoute) return;

    const { error } = await supabase
      .from('bus_routes')
      .update({ status: 'active', last_updated: new Date() })
      .eq('id', activeRoute.id);

    if (error) {
      toast.error('Failed to start trip');
      return;
    }

    setIsDriving(true);
    toast.success('Trip started! GPS broadcasting...');

    // Log start
    await supabase.from('bus_logs').insert({
      route_id: activeRoute.id,
      log_type: 'TRIP_START',
      lat: path[0].lat,
      lng: path[0].lng
    });

    startBroadcasting();
  };

  const endTrip = async () => {
    if (!activeRoute) return;

    const { error } = await supabase
      .from('bus_routes')
      .update({ status: 'inactive', last_updated: new Date() })
      .eq('id', activeRoute.id);

    if (error) {
      toast.error('Failed to end trip');
      return;
    }

    setIsDriving(false);
    stopBroadcasting();
    toast.success('Trip ended successfully');

    // Log end
    await supabase.from('bus_logs').insert({
      route_id: activeRoute.id,
      log_type: 'TRIP_END'
    });
  };

  const startBroadcasting = () => {
    let idx = 0;
    intervalRef.current = setInterval(async () => {
      const nextPos = path[idx % path.length];

      await supabase
        .from('bus_routes')
        .update({
          last_lat: nextPos.lat,
          last_lng: nextPos.lng,
          last_updated: new Date()
        })
        .eq('id', activeRoute.id);

      await supabase.from('bus_logs').insert({
        route_id: activeRoute.id,
        log_type: 'LOCATION_UPDATE',
        lat: nextPos.lat,
        lng: nextPos.lng
      });

      idx++;
      setPathIdx(idx % path.length);
    }, 5000);
  };

  const stopBroadcasting = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };

  useEffect(() => {
    return () => stopBroadcasting();
  }, []);

  return (
    <div className="driver-portal-page" style={{ padding: '2rem', background: '#0f172a', minHeight: '100vh', color: 'white' }}>
      <style>{`
        .driver-card {
          max-width: 600px;
          margin: 0 auto;
          background: #1e293b;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.05);
        }
        .driver-btn {
          width: 100%;
          padding: 20px;
          border-radius: 16px;
          font-size: 1.25rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          margin-bottom: 16px;
        }
        .start-btn {
          background: #2375e1;
          color: white;
        }
        .start-btn:hover { background: #155ab5; transform: scale(1.02); }
        .end-btn {
          background: #ef4444;
          color: white;
        }
        .end-btn:hover { background: #dc2626; transform: scale(1.02); }
        .status-badge {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 24px;
        }
        .gps-stat {
          background: rgba(255,255,255,0.05);
          padding: 16px;
          border-radius: 12px;
          font-family: monospace;
          color: #94a3b8;
        }
        .pulsing {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>

      <div className="driver-card">
        <h1 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Bus Driver Portal</h1>
        <p style={{ color: '#94a3b8', marginBottom: '32px' }}>Welcome, {profile?.full_name || 'Driver'}</p>

        <div className={`status-badge ${isDriving ? 'active' : ''}`} style={{
          background: isDriving ? '#065f46' : '#334155',
          color: isDriving ? '#34d399' : '#94a3b8'
        }}>
          {isDriving ? '● MISSION ACTIVE' : '○ STANDBY'}
        </div>

        {!isDriving ? (
          <button className="driver-btn start-btn" onClick={startTrip}>
            Start Trip
          </button>
        ) : (
          <button className="driver-btn end-btn" onClick={endTrip}>
            End Trip
          </button>
        )}

        {isDriving && (
          <div className="gps-stat">
            <div className="pulsing" style={{ color: '#34d399', marginBottom: '8px' }}>📡 Broadcasting GPS Signal...</div>
            <div>LAT: {path[pathIdx].lat.toFixed(4)}</div>
            <div>LNG: {path[pathIdx].lng.toFixed(4)}</div>
            <div style={{ marginTop: '8px', fontSize: '0.7rem' }}>Update freq: 5.0s</div>
          </div>
        )}

        <div style={{ marginTop: '32px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px' }}>
          <h3 style={{ fontSize: '1rem', color: '#cbd5e1', marginBottom: '12px' }}>Assigned Route</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{activeRoute?.route_name || 'No Route Assigned'}</span>
            <span style={{ color: '#2375e1' }}>#{activeRoute?.vehicle_number || '---'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverPortal;
