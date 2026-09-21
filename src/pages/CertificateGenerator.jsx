import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function CertificateGenerator() {
  const { courseId } = useParams();
  const { profile, demo } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [student, setStudent] = useState(null);
  const [credential, setCredential] = useState(null);
  const [school, setSchool] = useState(null);

  useEffect(() => {
    if (!courseId || !profile) return;
    fetchData();
  }, [courseId, profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (demo || !supabase) {
        // Mock Data for Demo
        const mockCourse = { id: courseId, title: 'Artificial Intelligence Mastery' };
        const mockStudent = {
          id: 'demo-student-uuid',
          profiles: { full_name: profile.full_name || 'Amina Hassan' }
        };
        const mockSchool = {
          name: 'Green Valley Academy',
          logo_url: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=128&auto=format&fit=crop',
          principal_name: 'Dr. Sarah Jenkins'
        };

        setCourse(mockCourse);
        setStudent(mockStudent);
        setSchool(mockSchool);
        setCredential({
          validation_hash: '5f9d3a7e2b1c4d8e9f0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u',
          issued_at: new Date().toISOString()
        });
        setLoading(false);
        return;
      }

      // 1. Fetch Course
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();
      if (courseErr) throw courseErr;
      setCourse(courseData);

      // 2. Fetch Student (Current User)
      const { data: studentData, error: studentErr } = await supabase
        .from('students')
        .select('*, profiles:profile_id(full_name, avatar_url), schools:school_id(*)')
        .eq('profile_id', profile.id)
        .single();

      if (studentErr) throw studentErr;
      setStudent(studentData);
      setSchool(studentData.schools);

      // 3. Check for existing credential
      const { data: credData, error: credErr } = await supabase
        .from('verified_credentials')
        .select('*')
        .eq('student_id', studentData.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (credErr) throw credErr;

      if (credData) {
        setCredential(credData);
      } else {
        // 4. Create new credential if it doesn't exist
        const newHash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        const { data: newCred, error: insertErr } = await supabase
          .from('verified_credentials')
          .insert({
            school_id: studentData.school_id,
            student_id: studentData.id,
            course_id: courseId,
            credential_type: 'COURSE_COMPLETION',
            validation_hash: newHash,
            issued_by: profile.id // Self-issued or system-issued marker
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        setCredential(newCred);
        toast.success('Certificate verified and issued!');
      }
    } catch (err) {
      console.error('Certificate Error:', err);
      toast.error('Failed to generate verified certificate');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
        <p className="mt-4 text-slate-600 font-medium">Verifying Academic Records...</p>
      </div>
    </div>
  );

  if (!course || !student || !credential) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Record Not Found</h2>
        <p className="text-slate-600 mb-6">We couldn't verify your completion status for this course.</p>
        <button onClick={() => navigate('/portal')} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-semibold">
          Return to Dashboard
        </button>
      </div>
    </div>
  );

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=VERIFY-${credential.validation_hash}`;

  return (
    <div className="min-h-screen bg-slate-100 py-12 px-4 print:p-0 print:bg-white">
      {/* Navigation Controls */}
      <div className="max-w-[850px] mx-auto mb-8 flex justify-between items-center no-print">
        <Link to={`/course/${courseId}`} className="text-slate-600 hover:text-slate-900 flex items-center gap-2 font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          Back to Course
        </Link>
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-amber-600/20 transition-all flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
            Download / Print PDF
          </button>
        </div>
      </div>

      {/* A4 Certificate Workspace */}
      <div className="certificate-container mx-auto">
        <div className="certificate-paper relative">
          {/* Ornate Border */}
          <div className="absolute inset-4 border-[6px] border-double border-amber-500/30 rounded-sm pointer-events-none"></div>
          <div className="absolute inset-8 border border-amber-500/20 rounded-sm pointer-events-none"></div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-between h-full p-16 text-center">

            {/* Header / Branding */}
            <div className="w-full flex justify-between items-start">
              <div className="text-left">
                <div className="flex items-center gap-3 mb-2">
                  <img src={school.logo_url || 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=128&auto=format&fit=crop'} alt="Logo" className="w-12 h-12 object-contain" />
                  <div>
                    <h3 className="text-slate-900 font-bold uppercase tracking-widest text-sm">{school.name}</h3>
                    <p className="text-[10px] text-amber-700 font-bold uppercase tracking-tighter">Verified Academic Institution</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Credential ID:</span>
                <p className="text-slate-900 text-xs font-mono">{credential.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            {/* Main Certificate Text */}
            <div className="my-auto py-12">
              <div className="mb-8">
                <h1 className="text-amber-600 font-serif italic text-3xl mb-1">Certificate</h1>
                <h2 className="text-slate-900 text-5xl font-serif font-bold uppercase tracking-[0.2em]">of Completion</h2>
              </div>

              <p className="text-slate-500 font-serif italic text-lg mb-6">This is to certify that</p>

              <h3 className="text-slate-900 text-4xl font-serif font-bold border-b-2 border-slate-200 inline-block px-12 pb-2 mb-8">
                {student.profiles?.full_name}
              </h3>

              <p className="text-slate-600 font-medium max-w-xl mx-auto leading-relaxed text-lg">
                has successfully completed all required academic modules and assessments
                demonstrating <span className="text-amber-700 font-bold">excellence</span> in the field of
              </p>

              <div className="mt-6">
                <h4 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">
                  {course.title}
                </h4>
              </div>
            </div>

            {/* Footer / Signatures & Verification */}
            <div className="w-full mt-auto">
              <div className="flex justify-between items-end mb-12">
                {/* Signature 1 */}
                <div className="text-center min-w-[180px]">
                  <div className="mb-2 h-16 flex items-end justify-center">
                    <span className="font-serif italic text-3xl text-slate-700" style={{ fontFamily: "'Dancing Script', cursive" }}>
                      {school.principal_name || 'Sarah Jenkins'}
                    </span>
                  </div>
                  <div className="border-t border-slate-300 pt-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Principal's Signature</p>
                  </div>
                </div>

                {/* Verification Seal / QR */}
                <div className="flex flex-col items-center">
                  <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-sm mb-2">
                    <img src={qrUrl} alt="Verification QR" className="w-20 h-20" />
                  </div>
                  <p className="text-[8px] font-mono text-slate-400 max-w-[120px] break-all">
                    VALIDATION HASH:<br/>
                    {credential.validation_hash}
                  </p>
                </div>

                {/* Date */}
                <div className="text-center min-w-[180px]">
                  <div className="mb-2 h-16 flex items-end justify-center">
                    <span className="text-xl font-serif text-slate-800">
                      {new Date(credential.issued_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="border-t border-slate-300 pt-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date of Issue</p>
                  </div>
                </div>
              </div>

              {/* Bottom Decorative Element */}
              <div className="flex items-center justify-center gap-4 text-amber-500/20">
                <div className="h-[1px] w-24 bg-current"></div>
                <div className="text-lg">✦</div>
                <div className="h-[1px] w-24 bg-current"></div>
              </div>
            </div>
          </div>

          {/* Background Watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none overflow-hidden">
            <h1 className="text-[15rem] font-black transform -rotate-45 uppercase select-none">
              Green Valley
            </h1>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');

        .certificate-container {
          width: 210mm;
          min-height: 297mm;
          padding: 10mm;
          background: white;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
          position: relative;
        }

        .certificate-paper {
          width: 100%;
          height: 100%;
          border: 1px solid #f1f5f9;
          background: #fff;
          background-image:
            radial-gradient(#f1f5f9 1px, transparent 1px),
            linear-gradient(to right, #ffffff, #fafafa);
          background-size: 20px 20px, 100% 100%;
        }

        @media print {
          .certificate-container {
            width: 100% !important;
            height: 100% !important;
            padding: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
          }

          body {
            margin: 0;
            padding: 0;
          }

          @page {
            size: A4;
            margin: 0;
          }

          .no-print {
            display: none !important;
          }
        }

        .font-serif {
          font-family: 'Playfair Display', Georgia, serif;
        }
      `}</style>
    </div>
  );
}
