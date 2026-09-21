import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function QuizPortal() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef(null);

  // Core app states
  const [quizzes, setQuizzes] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);

  // Student active quiz states
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { questionIdx: selectedOptionIdx }
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [quizFinishedSummary, setQuizFinishedSummary] = useState(null);

  // Teacher creation states
  const [isCreating, setIsCreating] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizTimeLimit, setQuizTimeLimit] = useState(30);
  const [questionsList, setQuestionsList] = useState([]);

  // Current question draft state
  const [draftQuestionText, setDraftQuestionText] = useState('');
  const [draftOptions, setDraftOptions] = useState(['', '', '', '']);
  const [draftCorrectIdx, setDraftCorrectIdx] = useState(0);

  useEffect(() => {
    if (profile) {
      const staffRoles = ['teacher', 'school_admin', 'super_admin'];
      setIsTeacher(staffRoles.includes(profile.role));
      fetchQuizzesAndResults();
    }
  }, [profile]);

  // Countdown timer effect
  useEffect(() => {
    if (activeQuiz && timeLeft > 0 && !quizFinishedSummary) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            // Auto submit when time runs out
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeQuiz, timeLeft, quizFinishedSummary]);

  const fetchQuizzesAndResults = async () => {
    if (!supabase || !profile?.school_id) return;
    setLoading(true);
    try {
      // Fetch Quizzes from Supabase
      const { data: quizzesData, error: quizErr } = await supabase
        .from('quizzes')
        .select('*')
        .eq('school_id', profile.school_id)
        .order('created_at', { ascending: false });

      if (quizErr) throw quizErr;
      setQuizzes(quizzesData || []);

      // Fetch Results depending on role
      if (profile.role === 'student') {
        const { data: studentData } = await supabase
          .from('students')
          .select('id')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (studentData) {
          const { data: resData } = await supabase
            .from('quiz_results')
            .select('*')
            .eq('student_id', studentData.id);
          setResults(resData || []);
        }
      } else {
        // Teachers see all results for the school's quizzes
        const { data: resData } = await supabase
          .from('quiz_results')
          .select('*, quizzes!inner(title, school_id)')
          .eq('quizzes.school_id', profile.school_id);
        setResults(resData || []);
      }
    } catch (err) {
      console.error('Error fetching quiz portal data:', err);
      toast.error('Failed to load assessment data.');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async (quiz) => {
    if (!supabase) return;
    try {
      // Fetch questions from Supabase
      const { data: qData, error: qErr } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', quiz.id);

      if (qErr) throw qErr;

      if (!qData || qData.length === 0) {
        toast.error('This quiz has no questions published.');
        return;
      }

      setQuizQuestions(qData);
      setActiveQuiz(quiz);
      setTimeLeft(quiz.time_limit_minutes * 60);
      setCurrentQuestionIdx(0);
      setSelectedAnswers({});
      setQuizFinishedSummary(null);
      toast.success(`Started: ${quiz.title}`);
    } catch (err) {
      toast.error('Error initiating quiz.');
      console.error(err);
    }
  };

  const handleSelectOption = (optionIdx) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQuestionIdx]: optionIdx
    }));
  };

  const handleAutoSubmit = () => {
    toast.error('Time limit reached! Auto-submitting your quiz.');
    submitQuiz(true);
  };

  const submitQuiz = async (isForced = false) => {
    if (timerRef.current) clearInterval(timerRef.current);

    let calculatedScore = 0;
    let totalPoints = 0;

    quizQuestions.forEach((q, idx) => {
      const correctIdx = q.correct_option_index;
      const studentSelected = selectedAnswers[idx];
      const points = q.points || 1;
      totalPoints += points;

      if (studentSelected !== undefined && parseInt(studentSelected) === parseInt(correctIdx)) {
        calculatedScore += points;
      }
    });

    const finalSummary = {
      score: calculatedScore,
      total_points: totalPoints,
      percentage: totalPoints > 0 ? Math.round((calculatedScore / totalPoints) * 100) : 0,
      answersBreakdown: quizQuestions.map((q, idx) => ({
        question: q.question_text,
        options: q.options,
        correctIdx: q.correct_option_index,
        selectedIdx: selectedAnswers[idx]
      }))
    };

    setQuizFinishedSummary(finalSummary);

    // Save to Database
    try {
      if (!supabase) return;

      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (sErr || !studentData) {
        throw new Error('Could not identify student record.');
      }

      const { error: insertErr } = await supabase
        .from('quiz_results')
        .insert({
          quiz_id: activeQuiz.id,
          student_id: studentData.id,
          score: calculatedScore,
          total_points: totalPoints
        });

      if (insertErr) throw insertErr;
      toast.success('Quiz submitted successfully!');
      fetchQuizzesAndResults();
    } catch (err) {
      console.error(err);
      toast.error('Could not save results to server.');
    }
  };

  const handleOptionChange = (idx, value) => {
    const updated = [...draftOptions];
    updated[idx] = value;
    setDraftOptions(updated);
  };

  const addDraftQuestion = () => {
    if (!draftQuestionText.trim()) return toast.error('Question text is required.');
    if (draftOptions.some(opt => !opt.trim())) return toast.error('Fill all 4 options.');

    const newQuestionObj = {
      question_text: draftQuestionText.trim(),
      options: [...draftOptions],
      correct_option_index: parseInt(draftCorrectIdx),
      points: 1
    };

    setQuestionsList([...questionsList, newQuestionObj]);
    setDraftQuestionText('');
    setDraftOptions(['', '', '', '']);
    setDraftCorrectIdx(0);
  };

  const generateAIQuestions = async () => {
    if (!quizTitle.trim()) return toast.error('Please enter a topic in the Title first.');
    const toastId = toast.loading(`SmartSchool AI is generating questions for "${quizTitle}"...`);

    setTimeout(() => {
      const aiQuestions = [
        { question_text: `What is the primary objective of ${quizTitle}?`, options: ['To increase efficiency', 'To reduce cost', 'To understand core principles', 'None of the above'], correct_option_index: 2, points: 1 },
        { question_text: `Which of these is a key component of ${quizTitle}?`, options: ['The standard model', 'The legacy system', 'The auxiliary unit', 'The primary interface'], correct_option_index: 0, points: 1 },
        { question_text: `How does ${quizTitle} affect modern ecosystems?`, options: ['Minimal impact', 'Significant growth driver', 'Temporary change', 'Stable state'], correct_option_index: 1, points: 1 },
        { question_text: `When was the concept of ${quizTitle} first established?`, options: ['18th Century', 'Early 20th Century', 'Post-modern era', 'Ancient times'], correct_option_index: 1, points: 1 },
        { question_text: `Who is recognized for pioneering work in ${quizTitle}?`, options: ['Leading researchers', 'The general public', 'Unidentified sources', 'Auxiliary staff'], correct_option_index: 0, points: 1 }
      ];
      setQuestionsList(aiQuestions);
      toast.success('AI Quiz Generated Successfully!', { id: toastId });
    }, 2000);
  };

  const saveCreatedQuiz = async (e) => {
    e.preventDefault();
    if (!quizTitle.trim() || questionsList.length === 0) return toast.error('Title and questions required.');

    try {
      if (!supabase) return;

      const { data: newQuiz, error: quizCreateErr } = await supabase
        .from('quizzes')
        .insert({
          school_id: profile.school_id,
          title: quizTitle.trim(),
          description: quizDescription.trim(),
          time_limit_minutes: parseInt(quizTimeLimit) || 30,
          created_by: profile.id
        })
        .select()
        .single();

      if (quizCreateErr) throw quizCreateErr;

      const structuredQuestions = questionsList.map(q => ({
        quiz_id: newQuiz.id,
        question_text: q.question_text,
        options: q.options,
        correct_option_index: q.correct_option_index,
        points: q.points
      }));

      const { error: questionsErr } = await supabase.from('quiz_questions').insert(structuredQuestions);
      if (questionsErr) throw questionsErr;

      toast.success('Quiz published successfully!');
      resetTeacherForm();
      fetchQuizzesAndResults();
    } catch (err) {
      console.error(err);
      toast.error('Failed to publish quiz.');
    }
  };

  const resetTeacherForm = () => {
    setIsCreating(false);
    setQuizTitle('');
    setQuizDescription('');
    setQuizTimeLimit(30);
    setQuestionsList([]);
    setDraftQuestionText('');
    setDraftOptions(['', '', '', '']);
    setDraftCorrectIdx(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return <div className="portal-loading"><div className="spinner"></div><p>Loading Quiz Engine...</p></div>;

  return (
    <div className="quiz-portal-container page-transition">
      <style dangerouslySetInnerHTML={{ __html: `
        .quiz-portal-container {
          min-height: 100vh;
          background: radial-gradient(circle at 50% 0%, #0d1b3e 0%, #060b19 100%);
          color: #f1f5f9;
          font-family: 'Inter', system-ui, sans-serif;
          padding: 30px 20px;
          box-sizing: border-box;
        }
        .quiz-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 1px solid rgba(0, 229, 255, 0.2);
          padding-bottom: 20px;
        }
        .quiz-brand-title {
          font-size: 28px;
          font-weight: 800;
          background: linear-gradient(135deg, #00E5FF 0%, #2979FF 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.5px;
        }
        .btn-back {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 10px 20px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
        }
        .btn-back:hover {
          background: rgba(0, 229, 255, 0.15);
          color: #ffffff;
          border-color: #00E5FF;
          box-shadow: 0 0 15px rgba(0, 229, 255, 0.3);
        }
        .glass-panel {
          background: rgba(13, 27, 62, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(0, 229, 255, 0.15);
          border-radius: 20px;
          padding: 30px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          margin-bottom: 30px;
        }
        .section-heading {
          font-size: 22px;
          font-weight: 700;
          color: #00E5FF;
          margin-top: 0;
          margin-bottom: 20px;
        }
        .quiz-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }
        .quiz-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 22px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .quiz-card:hover { border-color: #00E5FF; transform: translateY(-4px); }
        .quiz-card-title { font-size: 19px; font-weight: 700; margin: 0 0 10px 0; color: #ffffff; }
        .quiz-card-desc { font-size: 14px; color: #94a3b8; margin-bottom: 20px; line-height: 1.5; flex-grow: 1; }
        .quiz-meta { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #cbd5e1; margin-bottom: 15px; background: rgba(255, 255, 255, 0.05); padding: 6px 12px; border-radius: 8px; }
        .btn-action { width: 100%; background: linear-gradient(135deg, #2979FF 0%, #00E5FF 100%); border: none; color: white; font-weight: 700; padding: 12px; border-radius: 12px; cursor: pointer; }
        .btn-secondary { background: transparent; border: 1px solid #00E5FF; color: #00E5FF; font-weight: 600; padding: 10px 20px; border-radius: 12px; cursor: pointer; }
        .timer-badge { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 10px 18px; border-radius: 12px; font-weight: 700; font-size: 18px; }
        .progress-bar-container { background: rgba(255, 255, 255, 0.08); border-radius: 10px; height: 10px; width: 100%; margin-bottom: 30px; overflow: hidden; }
        .progress-bar-fill { height: 100%; background: linear-gradient(90deg, #2979FF, #00E5FF); transition: width 0.3s ease; }
        .question-text { font-size: 22px; font-weight: 600; line-height: 1.5; margin-bottom: 25px; color: #ffffff; }
        .options-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 30px; }
        .option-item { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 16px 20px; cursor: pointer; font-size: 16px; transition: all 0.2s ease; display: flex; align-items: center; gap: 15px; }
        .option-item.selected { background: rgba(41, 121, 255, 0.15); border-color: #00E5FF; }
        .radio-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.3); display: flex; align-items: center; justify-content: center; }
        .option-item.selected .radio-dot { border-color: #00E5FF; }
        .option-item.selected .radio-dot::after { content: ''; width: 10px; height: 10px; background: #00E5FF; border-radius: 50%; }
        .form-group { margin-bottom: 20px; }
        .form-label { display: block; margin-bottom: 8px; font-weight: 600; color: #cbd5e1; }
        .form-input { width: 100%; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 12px; color: white; box-sizing: border-box; }
        .draft-box { background: rgba(0, 229, 255, 0.03); border: 1px dashed rgba(0, 229, 255, 0.3); border-radius: 14px; padding: 20px; margin-top: 20px; }
        .added-q-badge { background: rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #00E5FF; }
        .score-circle { width: 120px; height: 120px; border-radius: 50%; background: rgba(0, 229, 255, 0.1); border: 3px solid #00E5FF; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0 auto 20px auto; font-weight: 800; font-size: 32px; color: #ffffff; }
        .badge-completed { background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #4ade80; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
      ` }} />

      {/* Header Bar */}
      <div className="quiz-header">
        <div>
          <div className="quiz-brand-title">🧠 MCQ Quiz Engine</div>
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>Welcome, {profile?.full_name || 'User'}</p>
        </div>
        <button className="btn-back tactile-btn" onClick={() => navigate('/portal')}>&larr; Back to Portal</button>
      </div>

      {/* ACTIVE QUIZ SCREEN */}
      {activeQuiz && !quizFinishedSummary && (
        <div className="glass-panel">
          <div className="quiz-taking-header">
            <div>
              <h2 style={{ margin: 0, color: '#ffffff' }}>{activeQuiz.title}</h2>
              <p style={{ margin: '5px 0 0 0', color: '#cbd5e1' }}>Question {currentQuestionIdx + 1} of {quizQuestions.length}</p>
            </div>
            <div className="timer-badge">⏳ {formatTime(timeLeft)}</div>
          </div>
          <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${((currentQuestionIdx + 1) / quizQuestions.length) * 100}%` }} /></div>
          <div className="question-text">{quizQuestions[currentQuestionIdx]?.question_text}</div>
          <div className="options-list">
            {quizQuestions[currentQuestionIdx]?.options?.map((option, idx) => (
              <div key={idx} className={`option-item ${selectedAnswers[currentQuestionIdx] === idx ? 'selected' : ''}`} onClick={() => handleSelectOption(idx)}>
                <div className="radio-dot"></div>
                <div>{option}</div>
              </div>
            ))}
          </div>
          <div className="nav-controls" style={{display:'flex', justifyContent:'space-between'}}>
            <button className="btn-secondary tactile-btn" disabled={currentQuestionIdx === 0} onClick={() => setCurrentQuestionIdx(prev => prev - 1)} style={{ opacity: currentQuestionIdx === 0 ? 0.4 : 1 }}>Previous</button>
            {currentQuestionIdx < quizQuestions.length - 1 ? (
              <button className="btn-secondary tactile-btn" onClick={() => setCurrentQuestionIdx(prev => prev + 1)}>Next</button>
            ) : (
              <button className="btn-action tactile-btn" style={{ width: 'auto', padding: '10px 30px' }} onClick={() => submitQuiz(false)}>Submit Quiz</button>
            )}
          </div>
        </div>
      )}

      {/* QUIZ COMPLETION SUMMARY */}
      {quizFinishedSummary && (
        <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '650px', margin: '0 auto 30px auto' }}>
          <div className="score-circle">{quizFinishedSummary.percentage}%<span>Score</span></div>
          <h2 style={{ color: '#00E5FF', marginBottom: '10px' }}>Quiz Completed!</h2>
          <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px' }}>
            {quizFinishedSummary.answersBreakdown.map((item, index) => (
              <div key={index} style={{ marginBottom: '12px' }}>
                <p style={{ fontWeight: '600', margin: '0 0 4px 0' }}>{index + 1}. {item.question}</p>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Your answer: <span style={{ color: item.selectedIdx === item.correctIdx ? '#4ade80' : '#f87171' }}>{item.selectedIdx !== undefined ? item.options[item.selectedIdx] : 'Skipped'}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="btn-action tactile-btn" style={{ marginTop: '25px', width: 'auto', padding: '12px 40px' }} onClick={() => { setActiveQuiz(null); setQuizFinishedSummary(null); fetchQuizzesAndResults(); }}>Close</button>
        </div>
      )}

      {/* TEACHER MODE: CREATE NEW QUIZ */}
      {isTeacher && isCreating && (
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: '#00E5FF' }}>Create New Assessment</h2>
            <button className="btn-secondary tactile-btn" onClick={resetTeacherForm}>Cancel</button>
          </div>
          <form onSubmit={saveCreatedQuiz}>
            <div className="form-group"><label className="form-label">Quiz Title</label><input type="text" className="form-input" value={quizTitle} onChange={e => setQuizTitle(e.target.value)} required/></div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows="2" value={quizDescription} onChange={e => setQuizDescription(e.target.value)}/></div>
            <div className="form-group" style={{ maxWidth: '150px' }}><label className="form-label">Time (Mins)</label><input type="number" className="form-input" value={quizTimeLimit} onChange={e => setQuizTimeLimit(e.target.value)} required/></div>

            <div className="draft-box">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}><h4 style={{ margin: 0, color: '#00E5FF' }}>⚡ AI Question Builder</h4><button type="button" className="button small" style={{background:'#a855f7'}} onClick={generateAIQuestions}>🧠 Auto-Generate</button></div>
              {questionsList.length > 0 && <div style={{marginBottom:'20px'}}>{questionsList.map((q, i) => <div key={i} className="added-q-badge"><span>Q{i+1}: {q.question_text}</span></div>)}</div>}
              <div className="form-group"><label className="form-label">Manual Question</label><input type="text" className="form-input" value={draftQuestionText} onChange={e => setDraftQuestionText(e.target.value)} placeholder="Type a question..."/></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>{draftOptions.map((opt, i) => <input key={i} className="form-input" value={opt} onChange={e => handleOptionChange(i, e.target.value)} placeholder={`Option ${i+1}`}/>)}</div>
              <button type="button" className="btn-secondary tactile-btn" style={{ width: '100%', marginTop: '15px' }} onClick={addDraftQuestion}>+ Add to List</button>
            </div>
            <button type="submit" className="btn-action tactile-btn" style={{ marginTop: '30px' }}>🚀 Publish Full Quiz</button>
          </form>
        </div>
      )}

      {/* DASHBOARD */}
      {!activeQuiz && !quizFinishedSummary && !isCreating && (
        <>
          {isTeacher && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '25px' }}><button className="btn-action tactile-btn" style={{ width: 'auto', padding: '12px 25px' }} onClick={() => setIsCreating(true)}>➕ Create New Assessment</button></div>}
          <div className="glass-panel">
            <h2 className="section-heading">📋 Active Examinations</h2>
            {quizzes.length === 0 ? <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No quizzes published yet.</p> : (
              <div className="quiz-grid">{quizzes.map((quiz) => {
                const hasTaken = results.find(r => r.quiz_id === quiz.id);
                return (
                  <div className="quiz-card neumorph-flat" key={quiz.id}>
                    <div><h3 className="quiz-card-title">{quiz.title}</h3><p className="quiz-card-desc">{quiz.description}</p></div>
                    <div><div className="quiz-meta"><span>⏱️ {quiz.time_limit_minutes}m</span><span>📅 {new Date(quiz.created_at).toLocaleDateString()}</span></div>
                      {profile?.role === 'student' ? (hasTaken ? <button className="btn-secondary" style={{ width: '100%' }} disabled>Score: {hasTaken.score}/{hasTaken.total_points}</button> : <button className="btn-action tactile-btn" onClick={() => startQuiz(quiz)}>🚀 Start</button>) : <button className="btn-secondary tactile-btn" style={{ width: '100%' }} onClick={() => startQuiz(quiz)}>👁️ Preview</button>}
                    </div>
                  </div>
                );
              })}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
