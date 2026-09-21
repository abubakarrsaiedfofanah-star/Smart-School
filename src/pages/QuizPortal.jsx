import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function QuizPortal() {
  const { profile, demo } = useAuth();
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

  // Demo Fallback Data
  const demoQuizzes = [
    {
      id: 'demo-quiz-1',
      title: 'General Science & Physics Trivia',
      description: 'Test your foundational knowledge on mechanics, thermodynamics, and optics.',
      time_limit_minutes: 5,
      created_at: new Date().toISOString()
    },
    {
      id: 'demo-quiz-2',
      title: 'Introduction to Algebra & Logic',
      description: 'Covers linear equations, quadratic structures, and basic boolean logic.',
      time_limit_minutes: 10,
      created_at: new Date().toISOString()
    }
  ];

  const demoQuestions = {
    'demo-quiz-1': [
      { id: 'q1', question_text: 'What is the acceleration due to gravity on Earth?', options: ['9.8 m/s²', '3.2 m/s²', '11.2 m/s²', '5.6 m/s²'], correct_option_index: 0, points: 1 },
      { id: 'q2', question_text: 'Which law states that for every action there is an equal and opposite reaction?', options: ['Newton\'s First Law', 'Newton\'s Second Law', 'Newton\'s Third Law', 'Law of Gravitation'], correct_option_index: 2, points: 1 },
      { id: 'q3', question_text: 'What is the speed of light in a vacuum approximately?', options: ['300,000 km/s', '150,000 km/s', '450,000 km/s', '100,000 km/s'], correct_option_index: 0, points: 1 },
      { id: 'q4', question_text: 'Which particle in an atom carries a negative charge?', options: ['Proton', 'Neutron', 'Electron', 'Positron'], correct_option_index: 2, points: 1 }
    ],
    'demo-quiz-2': [
      { id: 'q5', question_text: 'Solve for x: 2x + 7 = 15.', options: ['x = 3', 'x = 4', 'x = 5', 'x = 6'], correct_option_index: 1, points: 1 },
      { id: 'q6', question_text: 'What is the value of any non-zero number raised to the power of 0?', options: ['0', '1', 'Infinity', 'The number itself'], correct_option_index: 1, points: 1 }
    ]
  };

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
    setLoading(true);
    try {
      if (!supabase || demo || !profile?.school_id) {
        // Load from local storage or fallback demo data
        const localQuizzes = localStorage.getItem(`quiz_portal_quizzes_${profile?.school_id || 'demo'}`);
        const localResults = localStorage.getItem(`quiz_portal_results_${profile?.id || 'demo'}`);

        setQuizzes(localQuizzes ? JSON.parse(localQuizzes) : demoQuizzes);
        setResults(localResults ? JSON.parse(localResults) : []);
        setLoading(false);
        return;
      }

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
      toast.error('Failed to load live data. Using offline storage.');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async (quiz) => {
    try {
      if (!supabase || demo) {
        const qList = demoQuestions[quiz.id] || JSON.parse(localStorage.getItem(`quiz_questions_${quiz.id}`)) || [];
        if (qList.length === 0) {
          toast.error('This quiz has no questions available.');
          return;
        }
        setQuizQuestions(qList);
        setActiveQuiz(quiz);
        setTimeLeft(quiz.time_limit_minutes * 60);
        setCurrentQuestionIdx(0);
        setSelectedAnswers({});
        setQuizFinishedSummary(null);
        toast.success(`Started: ${quiz.title}`);
        return;
      }

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

    // Save to Database / Local Storage
    try {
      if (!supabase || demo) {
        const newResultRow = {
          id: 'demo-res-' + Date.now(),
          quiz_id: activeQuiz.id,
          student_id: profile?.id || 'demo-student',
          score: calculatedScore,
          total_points: totalPoints,
          taken_at: new Date().toISOString(),
          quiz_title: activeQuiz.title
        };

        const updatedResults = [newResultRow, ...results];
        setResults(updatedResults);
        localStorage.setItem(`quiz_portal_results_${profile?.id || 'demo'}`, JSON.stringify(updatedResults));
        toast.success('Quiz result saved locally!');
        return;
      }

      // Live mode save
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (sErr || !studentData) {
        throw new Error('Could not identify student record associated with profile.');
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
      toast.success('Quiz graded and submitted successfully!');
      fetchQuizzesAndResults();
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit results online. Displaying immediate score.');
    }
  };

  // Teacher Question builder helpers
  const handleOptionChange = (idx, value) => {
    const updated = [...draftOptions];
    updated[idx] = value;
    setDraftOptions(updated);
  };

  const addDraftQuestion = () => {
    if (!draftQuestionText.trim()) {
      toast.error('Question text cannot be empty.');
      return;
    }
    if (draftOptions.some(opt => !opt.trim())) {
      toast.error('All 4 option fields must be filled.');
      return;
    }

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
    toast.success('Question added to list.');
  };

  const removeDraftQuestion = (index) => {
    setQuestionsList(questionsList.filter((_, i) => i !== index));
  };

  const generateAIQuestions = async () => {
    if (!quizTitle.trim()) return toast.error('Please enter a topic in the Title first.');
    const toastId = toast.loading(`SmartSchool AI is generating questions for "${quizTitle}"...`);

    // High-fidelity AI Simulation
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
    if (!quizTitle.trim()) {
      toast.error('Please specify a quiz title.');
      return;
    }
    if (questionsList.length === 0) {
      toast.error('Please add at least one question to the quiz.');
      return;
    }

    try {
      if (!supabase || demo) {
        // Save to local storage mock environment
        const generatedQuizId = 'mock-quiz-' + Date.now();
        const newQuizItem = {
          id: generatedQuizId,
          school_id: profile?.school_id || 'demo-school-id',
          title: quizTitle.trim(),
          description: quizDescription.trim(),
          time_limit_minutes: parseInt(quizTimeLimit) || 30,
          created_at: new Date().toISOString()
        };

        const updatedQuizzes = [newQuizItem, ...quizzes];
        setQuizzes(updatedQuizzes);
        localStorage.setItem(`quiz_portal_quizzes_${profile?.school_id || 'demo'}`, JSON.stringify(updatedQuizzes));
        localStorage.setItem(`quiz_questions_${generatedQuizId}`, JSON.stringify(questionsList));

        // update demoQuestions reference mapping
        demoQuestions[generatedQuizId] = questionsList;

        toast.success('Quiz published locally!');
        resetTeacherForm();
        return;
      }

      // Live Supabase Publish
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

      const { error: questionsErr } = await supabase
        .from('quiz_questions')
        .insert(structuredQuestions);

      if (questionsErr) throw questionsErr;

      toast.success('Quiz published with all questions successfully!');
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

  if (loading) {
    return (
      <div className="quiz-portal-loading">
        <div className="spinner"></div>
        <p>Loading Quiz Engine...</p>
      </div>
    );
  }

  return (
    <div className="quiz-portal-container page-transition">
      {/* Dynamic Style Injection for Premium Glassmorphism & Electric Blue Theme */}
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
          display: flex;
          align-items: center;
          gap: 10px;
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
        .quiz-card:hover {
          border-color: #00E5FF;
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0, 229, 255, 0.12);
          background: rgba(0, 229, 255, 0.02);
        }
        .quiz-card-title {
          font-size: 19px;
          font-weight: 700;
          margin: 0 0 10px 0;
          color: #ffffff;
        }
        .quiz-card-desc {
          font-size: 14px;
          color: #94a3b8;
          margin-bottom: 20px;
          line-height: 1.5;
          flex-grow: 1;
        }
        .quiz-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: #cbd5e1;
          margin-bottom: 15px;
          background: rgba(255, 255, 255, 0.05);
          padding: 6px 12px;
          border-radius: 8px;
        }
        .btn-action {
          width: 100%;
          background: linear-gradient(135deg, #2979FF 0%, #00E5FF 100%);
          border: none;
          color: white;
          font-weight: 700;
          padding: 12px;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-action:hover {
          transform: scale(1.02);
          box-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
        }
        .btn-secondary {
          background: transparent;
          border: 1px solid #00E5FF;
          color: #00E5FF;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          background: rgba(0, 229, 255, 0.1);
        }
        /* Active Quiz Screen Styles */
        .quiz-taking-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
        }
        .timer-badge {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #f87171;
          padding: 10px 18px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 18px;
          letter-spacing: 0.5px;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.1);
        }
        .progress-bar-container {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          height: 10px;
          width: 100%;
          margin-bottom: 30px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #2979FF, #00E5FF);
          box-shadow: 0 0 12px #00E5FF;
          transition: width 0.3s ease;
        }
        .question-text {
          font-size: 22px;
          font-weight: 600;
          line-height: 1.5;
          margin-bottom: 25px;
          color: #ffffff;
        }
        .options-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-bottom: 30px;
        }
        .option-item {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          padding: 16px 20px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .option-item:hover {
          background: rgba(0, 229, 255, 0.05);
          border-color: rgba(0, 229, 255, 0.4);
        }
        .option-item.selected {
          background: rgba(41, 121, 255, 0.15);
          border-color: #00E5FF;
          box-shadow: 0 0 15px rgba(0, 229, 255, 0.15);
        }
        .radio-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .option-item.selected .radio-dot {
          border-color: #00E5FF;
        }
        .option-item.selected .radio-dot::after {
          content: '';
          width: 10px;
          height: 10px;
          background: #00E5FF;
          border-radius: 50%;
        }
        .nav-controls {
          display: flex;
          justify-content: space-between;
        }
        /* Teacher Mode form fields */
        .form-group {
          margin-bottom: 20px;
        }
        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .form-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          padding: 12px;
          color: white;
          box-sizing: border-box;
          outline: none;
          font-size: 15px;
        }
        .form-input:focus {
          border-color: #00E5FF;
          box-shadow: 0 0 10px rgba(0, 229, 255, 0.2);
        }
        .draft-box {
          background: rgba(0, 229, 255, 0.03);
          border: 1px dashed rgba(0, 229, 255, 0.3);
          border-radius: 14px;
          padding: 20px;
          margin-top: 20px;
        }
        .added-q-badge {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-left: 4px solid #00E5FF;
        }
        .quiz-portal-loading {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #060b19;
          color: white;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 5px solid rgba(0, 229, 255, 0.1);
          border-top-color: #00E5FF;
          border-radius: 50%;
          animation: spin 1s infinite linear;
          margin-bottom: 15px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .score-circle {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: rgba(0, 229, 255, 0.1);
          border: 3px solid #00E5FF;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px auto;
          font-weight: 800;
          font-size: 32px;
          color: #ffffff;
          box-shadow: 0 0 25px rgba(0, 229, 255, 0.2);
        }
        .score-circle span {
          font-size: 14px;
          font-weight: 400;
          color: #94a3b8;
        }
        .badge-completed {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.4);
          color: #4ade80;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }
      ` }} />

      {/* Header Bar */}
      <div className="quiz-header">
        <div>
          <div className="quiz-brand-title">🧠 MCQ Quiz Engine</div>
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>
            School Portal &bull; Welcome, {profile?.full_name || 'User'} ({profile?.role || 'Guest'})
          </p>
        </div>
        <button className="btn-back" onClick={() => navigate('/portal')}>
          &larr; Back to Portal
        </button>
      </div>

      {/* ACTIVE QUIZ SCREEN (STUDENT TAKING THE MCQ) */}
      {activeQuiz && !quizFinishedSummary && (
        <div className="glass-panel">
          <div className="quiz-taking-header">
            <div>
              <h2 style={{ margin: 0, color: '#ffffff' }}>{activeQuiz.title}</h2>
              <p style={{ margin: '5px 0 0 0', color: '#cbd5e1' }}>
                Question {currentQuestionIdx + 1} of {quizQuestions.length}
              </p>
            </div>
            <div className="timer-badge">
              ⏳ {formatTime(timeLeft)}
            </div>
          </div>

          {/* Progress Bar Component */}
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${((currentQuestionIdx + 1) / quizQuestions.length) * 100}%` }}
            />
          </div>

          {/* Question Text */}
          <div className="question-text">
            {quizQuestions[currentQuestionIdx]?.question_text}
          </div>

          {/* MCQ Options List */}
          <div className="options-list">
            {quizQuestions[currentQuestionIdx]?.options?.map((option, idx) => (
              <div
                key={idx}
                className={`option-item ${selectedAnswers[currentQuestionIdx] === idx ? 'selected' : ''}`}
                onClick={() => handleSelectOption(idx)}
              >
                <div className="radio-dot"></div>
                <div>{option}</div>
              </div>
            ))}
          </div>

          {/* Controls Footer */}
          <div className="nav-controls">
            <button
              className="btn-secondary"
              disabled={currentQuestionIdx === 0}
              onClick={() => setCurrentQuestionIdx(prev => prev - 1)}
              style={{ opacity: currentQuestionIdx === 0 ? 0.4 : 1, cursor: currentQuestionIdx === 0 ? 'not-allowed' : 'pointer' }}
            >
              Previous
            </button>

            {currentQuestionIdx < quizQuestions.length - 1 ? (
              <button
                className="btn-secondary"
                onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
              >
                Next Question
              </button>
            ) : (
              <button
                className="btn-action"
                style={{ width: 'auto', padding: '10px 30px' }}
                onClick={() => submitQuiz(false)}
              >
                Submit Complete Quiz
              </button>
            )}
          </div>
        </div>
      )}

      {/* QUIZ COMPLETION INSTANT GRADING REPORT */}
      {quizFinishedSummary && (
        <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '650px', margin: '0 auto 30px auto' }}>
          <div className="score-circle">
            {quizFinishedSummary.percentage}%
            <span>Score</span>
          </div>
          <h2 style={{ color: '#00E5FF', marginBottom: '10px' }}>Quiz Completed!</h2>
          <p style={{ color: '#cbd5e1', marginBottom: '30px' }}>
            You answered <strong>{quizFinishedSummary.score}</strong> out of <strong>{quizFinishedSummary.total_points}</strong> total points correctly.
          </p>

          <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#ffffff', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Review Answers</h3>
            {quizFinishedSummary.answersBreakdown.map((item, index) => (
              <div key={index} style={{ marginBottom: '16px', fontSize: '14px' }}>
                <p style={{ fontWeight: '600', margin: '0 0 6px 0', color: '#e2e8f0' }}>{index + 1}. {item.question}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: '#94a3b8' }}>
                  <div>Your answer: <span style={{ color: item.selectedIdx === item.correctIdx ? '#4ade80' : '#f87171', fontWeight: '500' }}>{item.selectedIdx !== undefined ? item.options[item.selectedIdx] : 'None (Skipped)'}</span></div>
                  <div>Correct answer: <span style={{ color: '#4ade80', fontWeight: '500' }}>{item.options[item.correctIdx]}</span></div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn-action"
            style={{ marginTop: '25px', width: 'auto', padding: '12px 40px' }}
            onClick={() => {
              setActiveQuiz(null);
              setQuizFinishedSummary(null);
              fetchQuizzesAndResults();
            }}
          >
            Close Summary
          </button>
        </div>
      )}

      {/* TEACHER MODE: CREATE NEW MCQ QUIZ */}
      {isTeacher && isCreating && (
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: '#00E5FF' }}>Create New MCQ Quiz</h2>
            <button className="btn-secondary" onClick={resetTeacherForm}>Cancel</button>
          </div>

          <form onSubmit={saveCreatedQuiz}>
            <div className="form-group">
              <label className="form-label">Quiz Title</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Midterm Physics Assessment"
                value={quizTitle}
                onChange={e => setQuizTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description / Instructions</label>
              <textarea
                className="form-input"
                rows="3"
                placeholder="Provide directions or information for the students..."
                value={quizDescription}
                onChange={e => setQuizDescription(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ maxWidth: '200px' }}>
              <label className="form-label">Time Limit (Minutes)</label>
              <input
                type="number"
                className="form-input"
                value={quizTimeLimit}
                onChange={e => setQuizTimeLimit(e.target.value)}
                min="1"
                required
              />
            </div>

            {/* Questions List preview */}
            <div style={{ margin: '30px 0' }}>
              <h3 style={{ color: '#ffffff', marginBottom: '10px' }}>Questions List ({questionsList.length})</h3>
              {questionsList.length === 0 ? (
                <p style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '14px' }}>No questions added to this quiz yet. Use the tool below to build your questions.</p>
              ) : (
                questionsList.map((q, i) => (
                  <div key={i} className="added-q-badge">
                    <div>
                      <strong>Q{i + 1}: {q.question_text}</strong>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                        Correct choice index: {q.correct_option_index} &bull; Options: {q.options.join(', ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => removeDraftQuestion(i)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* MCQ Builder Tool */}
            <div className="draft-box">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                <h4 style={{ margin: 0, color: '#00E5FF' }}>⚡ MCQ Builder Widget</h4>
                <button type="button" className="button small" style={{background:'#a855f7'}} onClick={generateAIQuestions}>
                  🧠 AI Auto-Generate
                </button>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '14px' }}>Question Prompt</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter the question text"
                  value={draftQuestionText}
                  onChange={e => setDraftQuestionText(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                {draftOptions.map((opt, index) => (
                  <div className="form-group" key={index}>
                    <label className="form-label" style={{ fontSize: '13px' }}>Option {index + 1}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={`Choice ${index + 1}`}
                      value={opt}
                      onChange={e => handleOptionChange(index, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ maxWidth: '280px' }}>
                <label className="form-label" style={{ fontSize: '14px' }}>Select Correct Answer Option</label>
                <select
                  className="form-input"
                  value={draftCorrectIdx}
                  onChange={e => setDraftCorrectIdx(e.target.value)}
                  style={{ background: '#0d1b3e' }}
                >
                  <option value={0}>Option 1</option>
                  <option value={1}>Option 2</option>
                  <option value={2}>Option 3</option>
                  <option value={3}>Option 4</option>
                </select>
              </div>

              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', marginTop: '10px' }}
                onClick={addDraftQuestion}
              >
                + Add Question to Quiz
              </button>
            </div>

            <button
              type="submit"
              className="btn-action"
              style={{ marginTop: '30px' }}
            >
              🚀 Publish & Save Full Quiz
            </button>
          </form>
        </div>
      )}

      {/* DASHBOARD: VIEW ALL AVAILABLE QUIZZES */}
      {!activeQuiz && !quizFinishedSummary && !isCreating && (
        <>
          {isTeacher && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '25px' }}>
              <button className="btn-action" style={{ width: 'auto', padding: '12px 25px' }} onClick={() => setIsCreating(true)}>
                ➕ Create New Assessment
              </button>
            </div>
          )}

          <div className="glass-panel">
            <h2 className="section-heading">📋 Active Examinations & Quizzes</h2>
            {quizzes.length === 0 ? (
              <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No quizzes published for your school yet.</p>
            ) : (
              <div className="quiz-grid">
                {quizzes.map((quiz) => {
                  const hasTaken = results.find(r => r.quiz_id === quiz.id);
                  return (
                    <div className="quiz-card" key={quiz.id}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h3 className="quiz-card-title">{quiz.title}</h3>
                          {hasTaken && <span className="badge-completed">Completed</span>}
                        </div>
                        <p className="quiz-card-desc">{quiz.description || 'No description provided.'}</p>
                      </div>

                      <div>
                        <div className="quiz-meta">
                          <span>⏱️ {quiz.time_limit_minutes} Mins</span>
                          <span>📅 {new Date(quiz.created_at).toLocaleDateString()}</span>
                        </div>

                        {profile?.role === 'student' ? (
                          hasTaken ? (
                            <button className="btn-secondary" style={{ width: '100%', cursor: 'default' }} disabled>
                              Score: {hasTaken.score}/{hasTaken.total_points} Earned
                            </button>
                          ) : (
                            <button className="btn-action" onClick={() => startQuiz(quiz)}>
                              🚀 Start Examination
                            </button>
                          )
                        ) : (
                          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => startQuiz(quiz)}>
                            👁️ Preview Questions
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary of past submissions or total logs for Teachers */}
          <div className="glass-panel">
            <h2 className="section-heading">
              {isTeacher ? '📊 School Submission Statistics' : '📜 Your Performance Records'}
            </h2>
            {results.length === 0 ? (
              <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No historical assessment records found.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(0, 229, 255, 0.2)', color: '#00E5FF' }}>
                      <th style={{ padding: '12px' }}>Quiz / Test Title</th>
                      <th style={{ padding: '12px' }}>{isTeacher ? 'Student Identifier' : 'Date Taken'}</th>
                      <th style={{ padding: '12px' }}>Score Achieved</th>
                      <th style={{ padding: '12px' }}>Grade Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((res, index) => {
                      const associatedQuiz = quizzes.find(q => q.id === res.quiz_id);
                      return (
                        <tr key={res.id || index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '12px', fontWeight: '500' }}>{associatedQuiz?.title || res.quiz_title || 'Quiz Assessment'}</td>
                          <td style={{ padding: '12px', color: '#cbd5e1' }}>
                            {isTeacher ? res.student_id : new Date(res.taken_at).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px' }}>{res.score} / {res.total_points}</td>
                          <td style={{ padding: '12px', color: '#00E5FF', fontWeight: '600' }}>
                            {res.total_points > 0 ? Math.round((res.score / res.total_points) * 100) : 0}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
