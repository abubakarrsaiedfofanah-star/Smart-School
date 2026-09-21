import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// Simple SVG Icons
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
  const { profile, demo } = useAuth();

  const [course, setCourse] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [progress, setProgress] = useState([]);
  const [activeChapter, setActiveChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  // AI Tutor state
  const [showAiTutor, setShowAiTutor] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const aiIntervalRef = useRef(null);

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
    }
  }, [courseId, profile]);

  useEffect(() => {
    // Reset or trigger AI response when chapter changes if panel is open
    setAiResponse('');
    setIsTyping(false);
    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    if (showAiTutor && activeChapter) {
      handleAskAI(activeChapter);
    }
  }, [activeChapter]);

  async function fetchCourseData() {
    setLoading(true);
    try {
      if (!supabase || demo || profile?.school_id === 'demo-school-id') {
        // Mock data for demo mode
        const mockCourse = {
          id: courseId,
          title: 'Advanced Neural Networks',
          description: 'Master the architectures of modern AI.'
        };
        const mockChapters = [
          { id: 'c1', title: 'Foundations of Deep Learning', content_body: 'Deep learning is a subset of machine learning using multi-layered artificial neural networks to model complex patterns in data. By stacking layers, networks can automatically learn hierarchical representations, from simple edges to abstract concepts.', video_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', sort_order: 0 },
          { id: 'c2', title: 'Convolutional Neural Networks', content_body: 'CNNs are the backbone of computer vision, utilizing convolutional layers to preserve spatial structure and extract localized features. They are highly efficient for image, video, and grid-structured data due to parameter sharing.', video_url: '', sort_order: 1 },
          { id: 'c3', title: 'Recurrent Neural Networks', content_body: 'RNNs handle sequential data by maintaining internal hidden states that act as memory. This makes them perfectly suited for natural language processing, time-series forecasting, and tasks where context and temporal order are paramount.', video_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', sort_order: 2 }
        ];
        setCourse(mockCourse);
        setChapters(mockChapters);
        setActiveChapter(mockChapters[0]);
        setProgress([]);
        return;
      }

      // Fetch Course
      const { data: cData, error: cErr } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();
      if (cErr) throw cErr;
      setCourse(cData);

      // Fetch Chapters
      const { data: chData, error: chErr } = await supabase
        .from('course_chapters')
        .select('*')
        .eq('course_id', courseId)
        .order('sort_order', { ascending: true });
      if (chErr) throw chErr;
      setChapters(chData || []);
      if (chData?.length > 0) setActiveChapter(chData[0]);

      // Fetch Progress
      const { data: pData } = await supabase
        .from('course_progress')
        .select('chapter_id')
        .eq('course_id', courseId)
        .eq('user_id', profile.id);
      setProgress(pData?.map(p => p.chapter_id) || []);

    } catch (err) {
      console.error(err);
      toast.error('Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  const handleMarkComplete = async () => {
    if (!activeChapter || completing) return;
    setCompleting(true);
    try {
      if (supabase && !demo && profile?.id) {
        const { error } = await supabase
          .from('course_progress')
          .upsert({
            user_id: profile.id,
            course_id: courseId,
            chapter_id: activeChapter.id,
            completed_at: new Date().toISOString()
          }, { onConflict: 'user_id, chapter_id' });

        if (error) throw error;
      }

      setProgress(prev => [...new Set([...prev, activeChapter.id])]);
      toast.success('Chapter completed!');

      // Move to next chapter
      const currentIndex = chapters.findIndex(c => c.id === activeChapter.id);
      if (currentIndex < chapters.length - 1) {
        setActiveChapter(chapters[currentIndex + 1]);
        window.scrollTo(0, 0);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to save progress');
    } finally {
      setCompleting(false);
    }
  };

  const handleAskAI = (target) => {
    const activeCh = target || activeChapter;
    if (!activeCh) return;

    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    setIsTyping(true);
    setAiResponse('');

    const bodyText = activeCh.content_body || '';
    const explanation = `🤖 AI Tutor Simplified Explanation:\n\n` +
      `In the chapter "${activeCh.title}", we dive into critical foundations. Here is a high-level summary:\n\n` +
      `✨ Core Concepts:\n` +
      `${bodyText.length > 150 ? bodyText.slice(0, 150) + '...' : bodyText || 'An introductory breakdown of this topic.'}\n\n` +
      `💡 Key Takeaway:\n` +
      `Focus on understanding how these structural rules or concepts connect to modern implementation workflows. Try mapping these parameters to real-world deployment cases.`;

    let currentText = '';
    let i = 0;

    aiIntervalRef.current = setInterval(() => {
      if (i < explanation.length) {
        currentText += explanation.charAt(i);
        setAiResponse(currentText);
        i++;
      } else {
        clearInterval(aiIntervalRef.current);
        setIsTyping(false);
      }
    }, 15);
  };

  const isCourseComplete = chapters.length > 0 && chapters.every(ch => progress.includes(ch.id));

  if (loading) return (
    <div className="min-h-screen bg-[#0a0f18] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  if (!course) return (
    <div className="min-h-screen bg-[#0a0f18] text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-4">Course Not Found</h1>
      <button onClick={() => navigate(-1)} className="text-blue-400 flex items-center gap-2">
        <Icons.ArrowLeft size={20} /> Go Back
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0f18] text-gray-100 flex flex-col lg:flex-row relative overflow-x-hidden">
      {/* Sidebar */}
      <aside className="w-full lg:w-80 bg-[#0f172a] border-r border-gray-800 flex flex-col max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-800">
          <button
            onClick={() => navigate('/library')}
            className="text-gray-400 hover:text-white mb-4 flex items-center gap-2 text-sm transition-colors"
          >
            <Icons.ArrowLeft size={16} /> Exit Academy
          </button>
          <h2 className="text-xl font-bold text-white leading-tight">{course.title}</h2>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <Icons.Layout size={14} />
            <span>{chapters.length} Chapters</span>
            <span className="mx-1">•</span>
            <Icons.CheckCircle size={14} className="text-green-500" />
            <span>{progress.length} Complete</span>
          </div>

          {/* Certificate Claim in Sidebar */}
          {isCourseComplete && (
            <button
              onClick={() => navigate(`/certificate/${courseId}`)}
              className="w-full mt-4 bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 text-xs py-2.5 px-3 rounded-xl font-bold hover:brightness-110 transition-all text-center flex items-center justify-center gap-1 shadow-md shadow-yellow-500/10"
            >
              Claim Verified Certificate 🎓
            </button>
          )}
        </div>

        <nav className="flex-1 py-4">
          {chapters.map((chapter, index) => {
            const isActive = activeChapter?.id === chapter.id;
            const isCompleted = progress.includes(chapter.id);

            return (
              <button
                key={chapter.id}
                onClick={() => {
                  setActiveChapter(chapter);
                  if (window.innerWidth < 1024) window.scrollTo(0, 0);
                }}
                className={`w-full text-left px-6 py-4 flex items-start gap-3 transition-all ${
                  isActive
                    ? 'bg-blue-600/10 border-r-4 border-blue-500 text-white'
                    : 'hover:bg-gray-800/50 text-gray-400'
                }`}
              >
                <div className="mt-1">
                  {isCompleted ? (
                    <Icons.CheckCircle size={18} className="text-green-500" />
                  ) : isActive ? (
                    <Icons.Play size={18} className="text-blue-500" />
                  ) : (
                    <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-700 flex items-center justify-center text-[10px]">
                      {index + 1}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>
                    {chapter.title}
                  </p>
                  {chapter.video_url && (
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 mt-1 block">Video Lesson</span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 max-h-screen overflow-y-auto bg-[#0a0f18] transition-all duration-300 ${showAiTutor ? 'lg:pr-80' : ''}`}>
        {activeChapter ? (
          <div className="max-w-4xl mx-auto p-6 lg:p-12 pb-32">
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-blue-500 font-bold tracking-widest text-xs uppercase">
                  Chapter {chapters.findIndex(c => c.id === activeChapter.id) + 1}
                </span>
                <h1 className="text-3xl lg:text-4xl font-extrabold text-white mt-2">
                  {activeChapter.title}
                </h1>
              </div>
              <button
                onClick={() => {
                  setShowAiTutor(true);
                  handleAskAI();
                }}
                className="self-start sm:self-center flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 transition-all font-semibold text-sm shadow-md"
              >
                <span>Ask AI Tutor ✨</span>
              </button>
            </div>

            {activeChapter.video_url && (
              <div className="aspect-video w-full bg-black rounded-xl overflow-hidden shadow-2xl mb-10 border border-gray-800">
                <iframe
                  src={activeChapter.video_url.replace('watch?v=', 'embed/')}
                  title={activeChapter.title}
                  className="w-full h-full"
                  allowFullScreen
                ></iframe>
              </div>
            )}

            <div className="prose prose-invert max-w-none mb-12">
              <div className="text-gray-300 leading-relaxed text-lg whitespace-pre-wrap">
                {activeChapter.content_body}
              </div>
            </div>

            {/* End of Course Certificate Claim Section */}
            {isCourseComplete && (
              <div className="mt-12 p-8 rounded-2xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-yellow-500/30 text-center shadow-2xl">
                <span className="text-3xl mb-2 block">🎓</span>
                <h3 className="text-2xl font-bold text-yellow-400 mb-2">Course Completed Successfully!</h3>
                <p className="text-gray-300 text-sm max-w-md mx-auto mb-6">
                  Great job! You have fully completed all chapters of this course. You are now eligible to claim your official verified certificate.
                </p>
                <button
                  onClick={() => navigate(`/certificate/${courseId}`)}
                  className="bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 px-8 py-3.5 rounded-xl font-bold shadow-xl hover:brightness-110 transform hover:-translate-y-0.5 transition-all text-base"
                >
                  Claim Verified Certificate 🎓
                </button>
              </div>
            )}

            {/* Fixed Bottom Bar */}
            <div className={`fixed bottom-0 left-0 lg:left-80 ${showAiTutor ? 'lg:right-80' : 'right-0'} p-6 bg-[#0f172a]/90 backdrop-blur-md border-t border-gray-800 flex justify-between items-center z-10 transition-all duration-300`}>
              <div className="hidden sm:block">
                <p className="text-sm text-gray-400">
                  {progress.includes(activeChapter.id) ? 'Status: Completed' : 'Status: In Progress'}
                </p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => {
                    setShowAiTutor(true);
                    handleAskAI();
                  }}
                  className="flex items-center gap-2 px-5 py-3 rounded-full font-bold bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 transition-all shadow-lg text-sm"
                >
                  <span>Ask AI Tutor ✨</span>
                </button>

                <button
                  onClick={handleMarkComplete}
                  disabled={completing}
                  className={`flex items-center gap-2 px-8 py-3 rounded-full font-bold transition-all shadow-lg text-sm ${
                    progress.includes(activeChapter.id)
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                  } disabled:opacity-50`}
                >
                  {completing ? 'Saving...' : (
                    <>
                      {progress.includes(activeChapter.id) ? 'Review Next' : 'Complete & Continue'}
                      <Icons.ChevronRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <Icons.BookOpen size={48} className="text-gray-700 mb-4" />
            <h2 className="text-xl font-bold text-white">Select a chapter to begin</h2>
            <p className="text-gray-500 mt-2">Choose a lesson from the sidebar to start your learning journey.</p>
          </div>
        )}
      </main>

      {/* AI Tutor Sidebar Panel */}
      {showAiTutor && (
        <aside className="w-full lg:w-80 bg-[#0f172a] border-l border-gray-800 flex flex-col fixed right-0 top-0 bottom-0 z-30 shadow-2xl h-full transition-all duration-300">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1e293b]/20">
            <div className="flex items-center gap-2">
              <span className="text-purple-400 text-lg">✨</span>
              <h3 className="text-lg font-bold text-white">AI Course Tutor</h3>
            </div>
            <button
              onClick={() => setShowAiTutor(false)}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
              title="Close Panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
            </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <div className="bg-[#0a0f18] border border-gray-800 rounded-xl p-4 min-h-[240px] flex flex-col justify-between">
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {aiResponse || (
                  <span className="text-gray-500 italic">Click "Ask AI Tutor" to get a simplified explanation of this chapter's core content.</span>
                )}
                {isTyping && (
                  <span className="inline-block w-2 h-4 bg-purple-500 ml-1 animate-pulse" />
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-800 bg-[#1e293b]/10 flex flex-col gap-2">
            <button
              onClick={() => handleAskAI()}
              disabled={isTyping}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/10"
            >
              <span>{isTyping ? 'Reading & Explaining...' : 'Regenerate Explanation 🔄'}</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
