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
  const [searchTerm, setSearchTerm] = useState('');

  const isStaff = ['school_admin', 'teacher', 'super_admin'].includes(profile?.role);

  useEffect(() => {
    if (profile?.school_id) fetchData();
  }, [profile]);

  async function fetchData() {
    if (!supabase) return;
    setLoading(true);
    try {
      const [subsRes, resRes] = await Promise.all([
        supabase.from('subjects').select('*').eq('school_id', profile.school_id).order('name'),
        supabase.from('resources').select('*, subjects(name)').eq('school_id', profile.school_id).order('created_at', { ascending: false })
      ]);
      setSubjects(subsRes.data || []);
      setResources(resRes.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!supabase || !file) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `library/${profile.school_id}/${Date.now()}.${fileExt}`;
      const { error: storageError } = await supabase.storage.from('resources').upload(filePath, file);
      if (storageError) throw storageError;

      const { error } = await supabase.from('resources').insert({
        school_id: profile.school_id,
        subject_id: selectedSubjectId || null,
        title: title.trim(),
        description: description.trim(),
        file_path: filePath,
        file_type: file.type,
        uploaded_by: profile.id
      });
      if (error) throw error;

      toast.success('Resource published!');
      fetchData();
      setTitle(''); setFile(null);
    } catch (err) { toast.error('Upload failed'); } finally { setUploading(false); }
  };

  const downloadResource = async (res) => {
    if (!supabase) return;
    const toastId = toast.loading('Generating secure link...');
    try {
      const { data, error } = await supabase.storage.from('resources').createSignedUrl(res.file_path, 900);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
      toast.success('Download ready!', { id: toastId });
    } catch (err) { toast.error('Verification failed', { id: toastId }); }
  };

  const filteredResources = resources.filter(res => !searchTerm || res.title.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="portal-loading"><div className="spinner"></div><p>Opening Institutional Repository...</p></div>;

  return (
    <div className="library-page page-transition">
      <style>{`
        .library-page { padding: 40px 24px; max-width: 1200px; margin: 0 auto; }
        .library-layout { display: grid; grid-template-columns: ${isStaff ? '350px 1fr' : '1fr'}; gap: 30px; }
        .res-card { display: flex; flex-direction: column; justify-content: space-between; height: 100%; transition: all 0.3s; }
        .glass-input, .glass-textarea { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); margin-bottom: 15px; }
      `}</style>

      <header style={{display:'flex', justifyContent:'space-between', marginBottom:'40px'}}>
        <div><p className="eyebrow">Institutional Library</p><h1>Academic Resources</h1></div>
        <button className="button outline-button tactile-btn" onClick={() => navigate('/portal')}>← Dashboard</button>
      </header>

      <div className="library-layout">
        {isStaff && (
          <div className="glass-card" style={{height:'fit-content'}}>
            <h3>Publish Resource</h3>
            <form onSubmit={handleUpload}>
              <input className="glass-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="File Title" required />
              <select className="glass-input" value={selectedSubjectId} onChange={e=>setSelectedSubjectId(e.target.value)}>
                <option value="">-- Choose Subject --</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="file" className="glass-input" onChange={e=>setFile(e.target.files[0])} required />
              <button className="button blue-button full tactile-btn" disabled={uploading}>{uploading ? 'Processing...' : 'Upload Resource'}</button>
            </form>
          </div>
        )}

        <div className="resources-section">
          <input className="glass-card" style={{marginBottom:'30px', padding:'15px', width:'100%'}} placeholder="Search repository..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'20px'}}>
            {filteredResources.map(res => (
              <div key={res.id} className="res-card glass-card neumorph-flat">
                <div><span className="badge" style={{fontSize:'0.7rem', marginBottom:'10px', display:'inline-block'}}>{res.subjects?.name || 'General'}</span><h3>{res.title}</h3><p style={{color:'var(--muted)', fontSize:'0.9rem'}}>{res.description}</p></div>
                <button className="button blue-button full tactile-btn" style={{marginTop:'20px'}} onClick={()=>downloadResource(res)}>📥 Secure Download</button>
              </div>
            ))}
          </div>
          {filteredResources.length === 0 && <p style={{textAlign:'center', color:'var(--muted)', padding:'40px'}}>No matching resources found.</p>}
        </div>
      </div>
    </div>
  );
}
