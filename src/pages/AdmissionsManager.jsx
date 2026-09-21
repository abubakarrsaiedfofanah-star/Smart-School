import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const AdmissionsManager = () => {
  const { profile, demo } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  const STAGES = ['Pending', 'Interview', 'Accepted', 'Rejected'];

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      if (demo || !supabase) {
        setApplications([
          { id: '1', student_first_name: 'Alice', student_last_name: 'Smith', grade_level: '5', status: 'Pending', parent_name: 'Robert Smith', created_at: new Date().toISOString() },
          { id: '2', student_first_name: 'Bob', student_last_name: 'Johnson', grade_level: '3', status: 'Interview', parent_name: 'Mary Johnson', created_at: new Date().toISOString() },
          { id: '3', student_first_name: 'Charlie', student_last_name: 'Brown', grade_level: '1', status: 'Accepted', parent_name: 'Lucy Brown', created_at: new Date().toISOString() },
        ]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data);
    } catch (error) {
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    try {
      if (demo || !supabase) {
        setApplications(prev => prev.map(app => app.id === id ? { ...app, status: newStatus } : app));
        toast.success(`Updated to ${newStatus}`);
        return;
      }

      const { error } = await supabase
        .from('applications')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      setApplications(prev => prev.map(app => app.id === id ? { ...app, status: newStatus } : app));
      toast.success(`Updated to ${newStatus}`);
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const enrollStudent = async (app) => {
    try {
      if (demo || !supabase) {
        toast.success(`${app.student_first_name} enrolled successfully!`);
        setApplications(prev => prev.filter(a => a.id !== app.id));
        return;
      }

      // 1. Create student record
      const { error: studentError } = await supabase
        .from('students')
        .insert([{
          first_name: app.student_first_name,
          last_name: app.student_last_name,
          date_of_birth: app.date_of_birth,
          grade_level: app.grade_level,
          parent_name: app.parent_name,
          parent_email: app.parent_email,
          parent_phone: app.parent_phone,
          status: 'Active',
          school_id: profile?.school_id
        }]);

      if (studentError) throw studentError;

      // 2. Delete or mark application as archived
      const { error: appError } = await supabase
        .from('applications')
        .delete()
        .eq('id', app.id);

      if (appError) throw appError;

      setApplications(prev => prev.filter(a => a.id !== app.id));
      toast.success(`${app.student_first_name} is now a student!`);
    } catch (error) {
      toast.error('Enrollment failed: ' + error.message);
    }
  };

  const Column = ({ stage }) => {
    const stageApps = applications.filter(app => app.status === stage);

    return (
      <div className="flex-1 min-w-[300px] bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col h-[calc(100vh-200px)]">
        <div className="flex items-center justify-between mb-4 px-2">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              stage === 'Pending' ? 'bg-amber-400' :
              stage === 'Interview' ? 'bg-blue-400' :
              stage === 'Accepted' ? 'bg-emerald-400' : 'bg-rose-400'
            }`}></span>
            {stage}
            <span className="ml-2 px-2 py-0.5 bg-slate-200 rounded-full text-xs text-slate-500">{stageApps.length}</span>
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
          {stageApps.map(app => (
            <div
              key={app.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-slate-800">{app.student_first_name} {app.student_last_name}</h4>
                  <p className="text-xs text-slate-500">Grade {app.grade_level}</p>
                </div>
                {stage === 'Accepted' && (
                  <button
                    onClick={() => enrollStudent(app)}
                    className="text-[10px] bg-emerald-600 text-white px-2 py-1 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
                  >
                    ENROLL
                  </button>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-600">
                <p>👤 {app.parent_name}</p>
                <p className="mt-1">📅 Applied: {new Date(app.created_at).toLocaleDateString()}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
                {STAGES.filter(s => s !== stage).map(s => (
                  <button
                    key={s}
                    onClick={() => updateStatus(app.id, s)}
                    className="text-[9px] px-2 py-1 bg-slate-100 text-slate-500 rounded hover:bg-slate-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {stageApps.length === 0 && (
            <div className="h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-sm">
              No applications
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-10 max-w-[1600px] mx-auto min-h-screen bg-white">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Admissions <span className="text-blue-600">Pipeline</span></h1>
          <p className="text-slate-500 mt-2 font-medium">Manage prospective students and recruitment growth.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Applications</p>
            <p className="text-2xl font-black text-slate-800">{applications.length}</p>
          </div>
          <div className="bg-blue-50 px-6 py-3 rounded-2xl border border-blue-100">
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Conversion Rate</p>
            <p className="text-2xl font-black text-blue-700">
              {applications.length > 0
                ? `${Math.round((applications.filter(a => a.status === 'Accepted').length / applications.length) * 100)}%`
                : '0%'}
            </p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide">
          {STAGES.map(stage => (
            <Column key={stage} stage={stage} />
          ))}
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default AdmissionsManager;
