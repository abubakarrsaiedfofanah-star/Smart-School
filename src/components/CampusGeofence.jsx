import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const CAMPUS_LAT = -1.286389;
const CAMPUS_LON = 36.817223;
const RADIUS_METERS = 200;

export default function CampusGeofence() {
  const { profile, demo } = useAuth();
  const [coords, setCoords] = useState({ latitude: -1.288000, longitude: 36.815000 }); // Default: Away
  const [distance, setDistance] = useState(null);
  const [isOnCampus, setIsOnCampus] = useState(false);
  const [isSimulated, setIsSimulated] = useState(true);
  const [attendanceStatus, setAttendanceStatus] = useState('Idle'); // Idle, Marking, Marked, Error
  const [schoolHoursActive, setSchoolHoursActive] = useState(true); // Default simulated to true for testing
  const [gpsError, setGpsError] = useState(null);

  // Haversine formula to compute distance in meters
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Radius of the Earth in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Update distance and campus status whenever coordinates change
  useEffect(() => {
    const dist = calculateDistance(coords.latitude, coords.longitude, CAMPUS_LAT, CAMPUS_LON);
    setDistance(dist);
    setIsOnCampus(dist <= RADIUS_METERS);
  }, [coords]);

  // Real GPS Geolocation tracking
  useEffect(() => {
    if (isSimulated) return;

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setIsSimulated(true);
      return;
    }

    const handleSuccess = (position) => {
      setGpsError(null);
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    };

    const handleError = (error) => {
      setGpsError(error.message || 'Failed to acquire GPS lock.');
      setIsSimulated(true);
    };

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSimulated]);

  // Real-time automated attendance logging
  useEffect(() => {
    if (isOnCampus && schoolHoursActive && attendanceStatus === 'Idle') {
      triggerAutomaticAttendance();
    }
  }, [isOnCampus, schoolHoursActive, attendanceStatus]);

  const triggerAutomaticAttendance = async () => {
    setAttendanceStatus('Marking');

    // Check school hours strictly or simulate them
    const now = new Date();
    const hours = now.getHours();
    const isStandardSchoolHours = hours >= 8 && hours < 16;

    if (!schoolHoursActive && !isStandardSchoolHours) {
      setAttendanceStatus('Error');
      return;
    }

    if (demo || !supabase || !profile) {
      // Simulate successful marking in demo mode
      setTimeout(() => {
        setAttendanceStatus('Marked');
      }, 1500);
      return;
    }

    try {
      // 1. Fetch the student ID associated with this profile
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, school_id, class_id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (studentError || !studentData) {
        throw new Error(studentError?.message || 'Student record not found for this profile.');
      }

      const todayStr = now.toISOString().split('T')[0];

      // 2. Upsert presence status into the attendance table
      const { error: attendanceError } = await supabase
        .from('attendance')
        .upsert({
          school_id: studentData.school_id,
          student_id: studentData.id,
          class_id: studentData.class_id,
          attendance_date: todayStr,
          status: 'present',
          recorded_by: profile.id
        }, {
          onConflict: 'student_id,attendance_date'
        });

      if (attendanceError) throw attendanceError;

      setAttendanceStatus('Marked');
    } catch (err) {
      console.error('Zero-touch attendance sync failed:', err);
      setAttendanceStatus('Error');
    }
  };

  const simulateOnCampus = () => {
    setIsSimulated(true);
    // Slightly offset center to be inside the 200m geofence zone
    setCoords({ latitude: -1.286400, longitude: 36.817200 });
  };

  const simulateAway = () => {
    setIsSimulated(true);
    setCoords({ latitude: -1.305000, longitude: 36.840000 });
    if (attendanceStatus === 'Marked') {
      setAttendanceStatus('Idle'); // Reset status so they can test re-entry
    }
  };

  return (
    <div className="campus-geofence-widget glass-card" style={{ padding: '20px', borderRadius: '12px', margin: '15px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Zero-Touch Attendance</h3>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: '600',
            backgroundColor: isSimulated ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 12, 0.15)',
            color: isSimulated ? '#f59e0b' : '#10b90c'
          }}
        >
          {isSimulated ? 'Simulation Mode' : 'Live GPS'}
        </span>
      </div>

      {/* Presence Indicator Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ fontSize: '1.2rem' }}>
          {isOnCampus ? '🟢' : '⚪'}
        </div>
        <div>
          <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>
            {isOnCampus ? 'Securely on Campus' : 'Away from Campus'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {distance !== null ? `Distance to school: ${Math.round(distance)}m (Fence: 200m)` : 'Calculating distance...'}
          </div>
        </div>
      </div>

      {/* Attendance Sync Status */}
      <div style={{ fontSize: '0.85rem', marginBottom: '15px', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: 'var(--muted)' }}>School Hours Window:</span>
          <span style={{ fontWeight: '600', color: schoolHoursActive ? '#10b90c' : '#ef4444' }}>
            {schoolHoursActive ? 'Active (8:00 AM - 4:00 PM)' : 'Closed'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)' }}>Attendance Status:</span>
          <b style={{
            color: attendanceStatus === 'Marked' ? '#10b90c' : attendanceStatus === 'Marking' ? '#3b82f6' : 'var(--ink)'
          }}>
            {attendanceStatus === 'Idle' && '⏹️ Awaiting Geofence Check'}
            {attendanceStatus === 'Marking' && '⏳ Logging Presence...'}
            {attendanceStatus === 'Marked' && '✅ Present (Automatically Marked)'}
            {attendanceStatus === 'Error' && '❌ Sync Failed / Outside Hours'}
          </b>
        </div>
      </div>

      {gpsError && (
        <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '12px' }}>
          ⚠️ {gpsError}
        </div>
      )}

      {/* Interactive Controls for Verification/Simulation */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button
          onClick={simulateOnCampus}
          className="button"
          style={{
            flex: '1',
            fontSize: '0.8rem',
            padding: '6px 12px',
            cursor: 'pointer',
            backgroundColor: isOnCampus && isSimulated ? '#2563eb' : 'rgba(255,255,255,0.05)',
            color: isOnCampus && isSimulated ? '#fff' : 'var(--ink)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px'
          }}
        >
          📍 Inside Campus
        </button>
        <button
          onClick={simulateAway}
          className="button"
          style={{
            flex: '1',
            fontSize: '0.8rem',
            padding: '6px 12px',
            cursor: 'pointer',
            backgroundColor: !isOnCampus && isSimulated ? '#2563eb' : 'rgba(255,255,255,0.05)',
            color: !isOnCampus && isSimulated ? '#fff' : 'var(--ink)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px'
          }}
        >
          🚗 Outside Campus
        </button>
        <button
          onClick={() => setIsSimulated(!isSimulated)}
          className="button"
          style={{
            width: '100%',
            fontSize: '0.8rem',
            padding: '6px 12px',
            cursor: 'pointer',
            backgroundColor: !isSimulated ? '#10b90c' : 'transparent',
            color: !isSimulated ? '#fff' : 'var(--ink)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            marginTop: '4px'
          }}
        >
          {isSimulated ? '📡 Switch to Real GPS Device Sensor' : '⚙️ Switch to Simulation Controls'}
        </button>
      </div>

      {/* School Hours Simulation Toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={schoolHoursActive}
          onChange={(e) => {
            setSchoolHoursActive(e.target.checked);
            if (!e.target.checked && attendanceStatus !== 'Marked') {
              setAttendanceStatus('Idle');
            }
          }}
        />
        Simulate Active School Hours
      </label>
    </div>
  );
}
