import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Library() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [resources, setResources] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [file, setFile] = useState(null);

  const [searchSubject, setSearchSubject] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const isStaff = ['school_admin', 'teacher', 'super_admin'].includes(profile?.role);

  const demoResources = [
    { id: 'demo-1', title: 'Advanced Calculus Notes', description: 'Comprehensive guide to integration.', file_path: 'resources/calculus.pdf', file_type: 'application/pdf', created_at: '2026-09-10T10:00:00Z', subjects: { name: 'Mathematics' } },
    { id: 'demo-2', title: 'Physics Lab Template', description: 'Standard layout for experiments.', file_path: 'resources/physics.docx', file_type: 'word', created_at: '2026-09-12T14:30:00Z', subjects: { name: 'Physics' } },
    { id: 'demo-3', title: 'Organic Chemistry', description: 'Carbon bonding handout.', file_path: 'resources/chem.pdf', file_type: 'application/pdf', created_at: '2026-09-15T09:15:00Z', subjects: { name: 'Chemistry' } }
  ];

  useEffect(() => {
    if (!profile) return;
    fetchData();
  }, [profile]);

  async function fetchData() {
    setLoading(true);
    try {
      if (!supabase || !profile?.school_id) {
        setResources(demoResources);
        return;
      }
      const { data: subjectsData } = await supabase.from('subjects').select('*').eq('school_id', profile.school_id).order('name');
      setSubjects(subjectsData || []);
      const { data, error } = await supabase.from('resources').select('*, subjects(name, code)').eq('school_id', profile.school_id).order('created_at', { ascending: false });
      if (error) throw error;
      setResources(data || []);
    } catch (err) {
      console.error(err);
      setResources(demoResources);
    } finally {
      setLoading(false);
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      if (supabase && profile?.school_id) {
        const fileExt = file.name.split('.').pop();
        const filePath = `library/${profile.school_id}/${Date.now()}.${fileExt}`;
        await supabase.storage.from('resources').upload(filePath, file);
        await supabase.from('resources').insert({ school_id: profile.school_id, subject_id: selectedSubjectId || null, title: title.trim(), description: description.trim(), file_path: filePath, file_type: file.type, uploaded_by: profile.id });
        toast.success('Resource uploaded!');
        fetchData();
      } else {
        toast.success('Demo Upload Success!');
      }
      setTitle(''); setFile(null);
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const filteredResources = resources.filter(res => {
    const matchesSearch = !searchTerm || res.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const downloadResource = async (res) => {
    const toastId = toast.loading('Generating secure download link...');
    try {
      if (!supabase || !profile?.school_id) {
        toast.success('Secure link generated (Demo)!', { id: toastId });
        return;
      }
      const { data, error } = await supabase.storage
        .from('resources')
        .createSignedUrl(res.file_path, 900);
      if (error) throw error;
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = res.title;
      a.click();
      toast.success('Download started!', { id: toastId });
    } catch (err) {
      toast.error('Security verification failed.', { id: toastId });
    }
  };

  if (loading) return <div className="portal-loading"><div className="spinner"></div></div>;

  return (
    <div className="library-page page-transition">
      <style>{`
        .library-page { padding: 40px 24px; max-width: 1200px; margin: 0 auto; }
        .library-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .library-header h1 { font: 800 2.5rem 'DM Sans', sans-serif; background: linear-gradient(135deg, var(--green) 0%, var(--ink) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; }

        .library-layout { display: grid; grid-template-columns: ${isStaff ? '350px 1fr' : '1fr'}; gap: 30px; }
        .upload-card { position: sticky; top: 30px; height: fit-content; }

        .resources-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .res-card { display: flex; flex-direction: column; justify-content: space-between; height: 100%; transition: all 0.3s; }
        .res-card:hover { transform: translateY(-8px); }
        .res-badge { display: inline-block; padding: 4px 12px; background: var(--cream); color: var(--green); border-radius: 20px; font-size: 0.7rem; font-weight: 800; margin-bottom: 15px; }
        .res-title { font: 800 1.3rem 'DM Sans', sans-serif; color: var(--ink); margin-bottom: 10px; }
        .res-desc { color: var(--muted); font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px; flex: 1; }

        @media (max-width: 1024px) {
          .library-layout { grid-template-columns: 1fr; }
          .upload-card { position: static; }
        }
      `}</style>

      <header className="library-header">
        <div>
          <p className="eyebrow">Enterprise Library</p>
          <h1>Resource Repository</h1>
        </div>
        <button className="button outline-button" onClick={() => navigate('/portal')}>← Portal</button>
      </header>

      <div className="library-layout">
        <div className="structured-courses glass-card" style={{gridColumn: '1 / -1', marginBottom: '20px'}}>
           <h3>Structured Learning Paths</h3>
           <p style={{color: 'var(--muted)', fontSize: '0.9rem'}}>Enroll in a curated course with sequential chapters and video lessons.</p>
           <button className="button blue-button" style={{marginTop: '15px'}} onClick={() => navigate('/course-builder')}>
             Browse All Courses 🎓
           </button>
        </div>

        {isStaff && (
          <div className="upload-card glass-card">
            <h3>Upload New File</h3>
            <form onSubmit={handleUpload}>
              <label>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required />
              <label>File</label>
              <input type="file" onChange={e => setFile(e.target.files[0])} required />
              <button className="button blue-button full" style={{marginTop: '20px'}} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Publish Resource'}
              </button>
            </form>
          </div>
        )}

        <div className="resources-section">
          <input
            className="glass-card"
            style={{marginBottom: '30px', padding: '15px'}}
            placeholder="Search resources..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />

          <div className="resources-grid">
            {filteredResources.map(res => (
              <div key={res.id} className="res-card glass-card">
                <div>
                  <span className="res-badge">{res.subjects?.name || 'General'}</span>
                  <div className="res-title">{res.title}</div>
                  <p className="res-desc">{res.description}</p>
                </div>
                <button className="button blue-button full" onClick={() => downloadResource(res)}>
                  📥 Secure Download
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
