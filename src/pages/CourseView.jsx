import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const Icons = {
  ChevronRight: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  CheckCircle: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Play: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  BookOpen: ({ size = 24, className }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"/></svg>,
  ArrowLeft: ({ size = 20 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>,
  Layout: ({ size = 14 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
};

export default function CourseView() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { profile, school } = useAuth();

  const [course, setCourse] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [progress, setProgress] = useState([]);
  const [activeChapter, setActiveChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const [showAiTutor, setShowAiTutor] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const aiIntervalRef = useRef(null);

  useEffect(() => {
    if (courseId) fetchCourseData();
  }, [courseId, profile]);

  useEffect(() => {
    setAiResponse(''); setIsTyping(false);
    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    if (showAiTutor && activeChapter) handleAskAI(activeChapter);
  }, [activeChapter]);

  async function fetchCourseData() {
    if (!supabase || !courseId) return;
    setLoading(true);
    try {
      const [cRes, chRes, pRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).single(),
        supabase.from('course_chapters').select('*').eq('course_id', courseId).order('sort_order', { ascending: true }),
        supabase.from('course_progress').select('chapter_id').eq('chapter_id', activeChapter?.id).eq('student_id', profile?.id)
      ]);

      if (cRes.error) throw cRes.error;
      setCourse(cRes.data);
      setChapters(chRes.data || []);
      if (chRes.data?.length > 0) setActiveChapter(chRes.data[0]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  const handleMarkComplete = async () => {
    if (!activeChapter || completing || !supabase) return;
    setCompleting(true);
    try {
        const { error } = await supabase.from('course_progress').upsert({
            student_id: profile.id,
            chapter_id: activeChapter.id,
            completed_at: new Date().toISOString()
        });
        if (error) throw error;
        setProgress(prev => [...new Set([...prev, activeChapter.id])]);
        toast.success('Chapter completed!');
        const idx = chapters.findIndex(c => c.id === activeChapter.id);
        if (idx < chapters.length - 1) setActiveChapter(chapters[idx + 1]);
    } catch (err) { toast.error('Failed to save progress'); } finally { setCompleting(false); }
  };

  const handleAskAI = (target) => {
    const ch = target || activeChapter;
    if (!ch) return;
    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    setIsTyping(true); setAiResponse('');
    const explanation = `🤖 AI Tutor:\n\nIn "${ch.title}", we explore key fundamentals. \n\nFocus on the core mechanics described in the body. If you have questions about specific terms, try referencing the glossary in the Library.`;
    let currentText = '', i = 0;
    aiIntervalRef.current = setInterval(() => {
      if (i < explanation.length) {
        currentText += explanation.charAt(i); setAiResponse(currentText); i++;
      } else { clearInterval(aiIntervalRef.current); setIsTyping(false); }
    }, 20);
  };

  const isCourseComplete = chapters.length > 0 && chapters.every(ch => progress.includes(ch.id));

  if (loading) return <div className="portal-loading"><div className="spinner"></div><p>Opening Academy Content...</p></div>;
  if (!course) return <div style={{textAlign:'center', marginTop:'100px'}}><h1>Course Not Found</h1><button onClick={()=>navigate(-1)}>Go Back</button></div>;

  return (
    <div className="min-h-screen bg-[#0a0f18] text-gray-100 flex flex-col lg:flex-row relative">
      <aside className="w-full lg:w-80 bg-[#0f172a] border-r border-gray-800 flex flex-col max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-800">
          <button onClick={() => navigate('/library')} className="text-gray-400 hover:text-white mb-4 flex items-center gap-2 text-sm transition-colors"><Icons.ArrowLeft size={16} /> Exit</button>
          <h2 className="text-xl font-bold text-white">{course.title}</h2>
          {isCourseComplete && <button onClick={() => navigate(`/certificate/${courseId}`)} className="w-full mt-4 bg-yellow-500 text-slate-900 py-2 rounded-xl font-bold">Claim Certificate 🎓</button>}
        </div>
        <nav className="flex-1 py-4">
          {chapters.map((ch, i) => (
            <button key={ch.id} onClick={() => setActiveChapter(ch)} className={`w-full text-left px-6 py-4 flex gap-3 ${activeChapter?.id === ch.id ? 'bg-blue-600/10 border-r-4 border-blue-500' : ''}`}>
              <div className="mt-1">{progress.includes(ch.id) ? <Icons.CheckCircle className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-gray-600 flex items-center justify-center text-[10px]">{i + 1}</div>}</div>
              <p className="text-sm">{ch.title}</p>
            </button>
          ))}
        </nav>
      </aside>

      <main className={`flex-1 overflow-y-auto bg-[#0a0f18] ${showAiTutor ? 'lg:pr-80' : ''}`}>
        {activeChapter ? (
          <div className="max-w-4xl mx-auto p-6 lg:p-12 pb-32">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-extrabold text-white">{activeChapter.title}</h1>
                <button onClick={() => { setShowAiTutor(true); handleAskAI(); }} className="button small" style={{background:'#a855f7'}}>Ask AI Tutor ✨</button>
            </div>
            {activeChapter.video_url && <div className="aspect-video w-full rounded-xl overflow-hidden mb-8"><iframe src={activeChapter.video_url.replace('watch?v=', 'embed/')} className="w-full h-full" allowFullScreen></iframe></div>}
            <div className="text-gray-300 leading-relaxed text-lg whitespace-pre-wrap">{activeChapter.content_body}</div>

            <div className="fixed bottom-0 left-0 lg:left-80 right-0 p-6 bg-[#0f172a]/90 backdrop-blur-md border-t border-gray-800 flex justify-end gap-3 z-10">
              <button onClick={() => { setShowAiTutor(true); handleAskAI(); }} className="button small outline">AI Concierge ✨</button>
              <button onClick={handleMarkComplete} disabled={completing} className="button blue-button">{completing ? 'Saving...' : 'Complete & Continue →'}</button>
            </div>
          </div>
        ) : <div className="h-full flex items-center justify-center text-gray-500">Select a lesson to begin.</div>}
      </main>

      {showAiTutor && (
        <aside className="w-full lg:w-80 bg-[#0f172a] border-l border-gray-800 fixed right-0 top-0 bottom-0 z-30 p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center"><h3>AI Tutor</h3><button onClick={()=>setShowAiTutor(false)}>×</button></div>
          <div className="flex-1 bg-black/30 rounded-xl p-4 text-sm text-gray-300 overflow-y-auto">{aiResponse} {isTyping && '...'}</div>
        </aside>
      )}
    </div>
  );
}
