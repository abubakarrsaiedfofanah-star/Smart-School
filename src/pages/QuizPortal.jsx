import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const ASSESSMENT_TYPES = ['quiz', 'cat', 'test', 'exam'];
const ASSESSMENT_PRESETS = {
  quiz: { minutes: 10, attempts: 2, weight: 1, hint: 'Quick practice with immediate feedback.' },
  cat: { minutes: 30, attempts: 1, weight: 1, hint: 'Continuous assessment for a unit or topic.' },
  test: { minutes: 60, attempts: 1, weight: 2, hint: 'A focused test across one or more topics.' },
  exam: { minutes: 120, attempts: 1, weight: 3, hint: 'A longer formal examination.' }
};
const RESOURCE_TYPES = new Set(['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
const QUESTION_PAPER_TYPES = new Set([
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf', 'text/rtf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp'
]);
const PAPER_TYPE_BY_EXTENSION = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', ods: 'application/vnd.oasis.opendocument.spreadsheet', odt: 'application/vnd.oasis.opendocument.text', odp: 'application/vnd.oasis.opendocument.presentation', rtf: 'application/rtf', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function localDateTime(date) {
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function downloadQuestionTemplate() {
  const csv = [
    'question,type,choices,option_labels,correct_answer,points,explanation,topic_tags,difficulty,rubric',
    '"What is 2 + 2?",mcq,"3|4|5|6","A,B,C,D",4,1,"Add the two numbers",arithmetic,easy,',
    '"The Earth orbits the Sun.",true_false,"",,True,1,,space,easy,',
    '"Explain your method.",short_answer,"",,,5,,problem solving,medium,"Method: 2 points; Answer: 3 points"'
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'smartschool-question-template.csv'; link.click(); URL.revokeObjectURL(url);
}

function formatChoices(question) {
  const choices = question.options || [];
  if (question.question_type !== 'mcq' || question.option_label_style === 'none') return choices;
  const custom = (question.custom_option_labels || '').split(',').map(label => label.trim());
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  return choices.map((choice, index) => {
    let label;
    if (question.option_label_style === 'numbers') label = String(index + 1);
    else if (question.option_label_style === 'lowercase') label = String.fromCharCode(97 + index);
    else if (question.option_label_style === 'roman') label = roman[index];
    else if (question.option_label_style === 'custom') label = custom[index];
    else label = String.fromCharCode(65 + index);
    if (!label) return choice;
    const separator = question.option_label_style === 'custom' && /[.)\]}:;]$/.test(label) ? '' : '.';
    return `${label}${separator} ${choice}`;
  });
}

function paperMimeType(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return file.type && QUESTION_PAPER_TYPES.has(file.type) ? file.type : PAPER_TYPE_BY_EXTENSION[extension] || '';
}

export default function QuizPortal() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isStaff = ['teacher', 'school_admin', 'super_admin'].includes(profile?.role);
  const timerRef = useRef(null);
  const submitGuard = useRef(false);
  const submitQuizRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [results, setResults] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [resources, setResources] = useState([]);
  const [bankQuestions, setBankQuestions] = useState([]);
  const [staffQuestions, setStaffQuestions] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [integrityByQuiz, setIntegrityByQuiz] = useState({});
  const [appealDrafts, setAppealDrafts] = useState({});
  const [newAppeal, setNewAppeal] = useState({ result_id: '', reason: '' });
  const [resourceUrls, setResourceUrls] = useState({});
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({ subject_id: '', class_id: '', unit_title: '', title: '', description: '' });
  const [resourceFile, setResourceFile] = useState(null);
  const [uploadingResource, setUploadingResource] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState('quiz');
  const [assessmentFormat, setAssessmentFormat] = useState('interactive');
  const [questionPaperFile, setQuestionPaperFile] = useState(null);
  const [questionPaperUrls, setQuestionPaperUrls] = useState({});
  const [timeLimit, setTimeLimit] = useState(30);
  const [opensAt, setOpensAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [resultsReleaseAt, setResultsReleaseAt] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [weight, setWeight] = useState(1);
  const [showAnswers, setShowAnswers] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [publishNow, setPublishNow] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [questionDraft, setQuestionDraft] = useState({ question_text: '', question_type: 'mcq', options: ['', '', '', ''], option_label_style: 'letters', custom_option_labels: '', correct_option_index: 0, points: 1, explanation: '', topic_tags: '', difficulty: 'medium', rubric: '', pool_group: '', pool_pick_count: 1, save_to_bank: false });
  const [editingQuestionIndex, setEditingQuestionIndex] = useState(null);
  const [bankSelection, setBankSelection] = useState('');
  const [saveImportedQuestionsToBank, setSaveImportedQuestionsToBank] = useState(false);
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [draftSyncState, setDraftSyncState] = useState('Saved on this device');
  const [largeAssessmentText, setLargeAssessmentText] = useState(false);
  const [highContrastAssessment, setHighContrastAssessment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [resultFilter, setResultFilter] = useState('all');
  const [reviewQueue, setReviewQueue] = useState([]);
  const [secondMarkQueue, setSecondMarkQueue] = useState([]);
  const [markDrafts, setMarkDrafts] = useState({});
  const [keyCorrectionDrafts, setKeyCorrectionDrafts] = useState({});
  const [accommodationDraft, setAccommodationDraft] = useState({ quiz_id: '', student_id: '', extra_time_minutes: 0, extra_attempts: 0, deadline_override: '', note: '' });

  const loadData = useCallback(async () => {
    if (!supabase || !profile?.school_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [quizResponse, subjectResponse, classResponse, resourceResponse, bankResponse, studentListResponse, accommodationResponse, staffQuestionResponse] = await Promise.all([
        supabase.from('quizzes').select('*, subjects(name), classes(name)').eq('school_id', profile.school_id).order('created_at', { ascending: false }),
        supabase.from('subjects').select('id,name').eq('school_id', profile.school_id).order('name'),
        supabase.from('classes').select('id,name').eq('school_id', profile.school_id).order('name'),
        supabase.from('subject_resources').select('*, subjects(name), classes(name)').eq('school_id', profile.school_id).order('created_at', { ascending: false }),
        isStaff ? supabase.from('quiz_question_bank').select('*').eq('school_id', profile.school_id).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        isStaff ? supabase.from('students').select('id,admission_number,class_id,profiles(full_name)').eq('school_id', profile.school_id).order('admission_number') : Promise.resolve({ data: [], error: null }),
        isStaff ? supabase.from('quiz_accommodations').select('*, quizzes(title), students(profiles(full_name))').eq('school_id', profile.school_id).order('updated_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        isStaff ? supabase.from('quiz_questions').select('id,quiz_id,question_text,question_type,options,correct_option_index,explanation,quizzes!inner(title,created_by,school_id)').eq('quizzes.school_id', profile.school_id).in('question_type', ['mcq','true_false']) : Promise.resolve({ data: [], error: null })
      ]);
      if (quizResponse.error) throw quizResponse.error;
      if (subjectResponse.error && subjectResponse.error.code !== '42P01') throw subjectResponse.error;
      if (classResponse.error && classResponse.error.code !== '42P01') throw classResponse.error;
      if (resourceResponse.error && resourceResponse.error.code !== '42P01') throw resourceResponse.error;
      if (bankResponse.error) throw bankResponse.error;
      if (studentListResponse.error) throw studentListResponse.error;
      if (accommodationResponse.error) throw accommodationResponse.error;
      if (staffQuestionResponse.error) throw staffQuestionResponse.error;
      const allQuizzes = quizResponse.data || [];
      setQuizzes(allQuizzes);
      setSubjects(subjectResponse.data || []);
      setClasses(classResponse.data || []);
      setResources(resourceResponse.data || []);
      setBankQuestions(bankResponse.data || []);
      setStudents(studentListResponse.data || []);
      setAccommodations(accommodationResponse.data || []);
      setStaffQuestions(staffQuestionResponse.data || []);

      if (profile.role === 'student') {
        const accommodationResult = await supabase.rpc('get_my_quiz_accommodations');
        if (accommodationResult.error) throw accommodationResult.error;
        setAccommodations(accommodationResult.data || []);
        const { data: student, error: studentError } = await supabase.from('students').select('id,class_id').eq('profile_id', profile.id).maybeSingle();
        if (studentError) throw studentError;
        if (student) {
          const { data, error } = await supabase.from('quiz_results').select('*, quizzes!inner(title,assessment_type,subject_id,unit_title,school_id,subjects(name))').eq('student_id', student.id).eq('quizzes.school_id', profile.school_id).order('taken_at', { ascending: false });
          if (error) throw error;
          setResults(data || []);
          const appealResponse = await supabase.from('quiz_appeals').select('*, quiz_results!inner(quiz_id,score,total_points, quizzes!inner(title,assessment_type,unit_title))').eq('student_id', student.id).order('created_at', { ascending: false });
          if (appealResponse.error) throw appealResponse.error;
          setAppeals(appealResponse.data || []);
        }
      } else {
        const { data, error } = await supabase.from('quiz_results').select('*, students(id,admission_number,profiles(full_name)), quizzes!inner(title,assessment_type,subject_id,unit_title,school_id,created_by)').eq('quizzes.school_id', profile.school_id).order('taken_at', { ascending: false });
        if (error) throw error;
        setResults(data || []);
        const appealResponse = await supabase.from('quiz_appeals').select('*, students(profiles(full_name)), quiz_results!inner(quiz_id,score,total_points, quizzes!inner(title,created_by,school_id))').eq('school_id', profile.school_id).order('created_at', { ascending: false });
        if (appealResponse.error) throw appealResponse.error;
        setAppeals((appealResponse.data || []).filter(appeal => profile.role === 'school_admin' || appeal.quiz_results?.quizzes?.created_by === profile.id));
        const integrityResponse = await supabase.from('quiz_integrity_events').select('event_type, quiz_attempt_sessions!inner(quiz_id, quizzes!inner(school_id))').eq('quiz_attempt_sessions.quizzes.school_id', profile.school_id);
        if (integrityResponse.error) throw integrityResponse.error;
        setIntegrityByQuiz((integrityResponse.data || []).reduce((counts, item) => {
          const quizId = item.quiz_attempt_sessions?.quiz_id;
          if (quizId) counts[quizId] = (counts[quizId] || 0) + 1;
          return counts;
        }, {}));
        const pending = (data || []).filter(item => item.needs_review);
        if (profile.role === 'teacher') {
          const { data: assignmentRows, error: assignmentError } = await supabase.from('teacher_subject_assignments').select('subject_id').eq('school_id', profile.school_id).eq('teacher_id', profile.id);
          if (assignmentError) throw assignmentError;
          const subjectIds = (assignmentRows || []).map(item => item.subject_id);
          if (subjectIds.length) {
            const { data: secondRows, error: secondError } = await supabase.from('quiz_answers').select('id,answer_value,earned_points,teacher_feedback,graded_at,quiz_questions!inner(id,quiz_id,question_text,question_type,points,rubric),quiz_results!inner(total_points,quiz_id,quizzes!inner(title,created_by,school_id,subject_id))').not('graded_at', 'is', null).eq('quiz_questions.question_type', 'short_answer').eq('quiz_results.quizzes.school_id', profile.school_id);
            if (secondError) throw secondError;
            setSecondMarkQueue((secondRows || []).filter(item => item.quiz_results?.quizzes?.created_by !== profile.id && subjectIds.includes(item.quiz_results?.quizzes?.subject_id)));
          } else setSecondMarkQueue([]);
        } else setSecondMarkQueue([]);
        if (pending.length) {
          const { data: answerData, error: answerError } = await supabase.from('quiz_answers').select('id,result_id,answer_value,earned_points,teacher_feedback,graded_at,quiz_questions!inner(id,question_text,question_type,points,rubric),quiz_results!inner(student_id,quiz_id,quizzes!inner(title,created_by,school_id))').is('graded_at', null).eq('quiz_questions.question_type', 'short_answer').eq('quiz_results.quizzes.school_id', profile.school_id);
          if (answerError) throw answerError;
          setReviewQueue((answerData || []).filter(item => profile.role === 'school_admin' || item.quiz_results?.quizzes?.created_by === profile.id));
        } else setReviewQueue([]);
      }
    } catch (error) {
      console.error('Assessment data could not be loaded:', error);
      toast.error(error.message || 'Could not load assessments. Apply the assessment database migration if it is not installed yet.');
    } finally { setLoading(false); }
  }, [profile, isStaff]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!expiresAt || !activeQuiz || summary) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !submitGuard.current) void submitQuizRef.current?.(true);
    };
    tick();
    timerRef.current = window.setInterval(tick, 1000);
    return () => window.clearInterval(timerRef.current);
  }, [expiresAt, activeQuiz, summary]);

  useEffect(() => {
    if (!activeQuiz || !activeSessionId) return;
    localStorage.setItem(`smartschool-assessment:${profile?.id}:${activeQuiz.id}:${activeSessionId}`, JSON.stringify(answers));
  }, [answers, activeQuiz, activeSessionId, profile?.id]);

  useEffect(() => {
    if (!activeQuiz || !activeSessionId || !supabase || !navigator.onLine) return undefined;
    setDraftSyncState('Saving securely…');
    const timeout = window.setTimeout(async () => {
      const { error } = await supabase.rpc('save_quiz_answer_drafts', { p_session_id: activeSessionId, p_answers: answers });
      setDraftSyncState(error ? 'Saved on this device; sync will retry when connected' : 'Saved securely');
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [answers, activeQuiz, activeSessionId]);

  useEffect(() => {
    if (!activeQuiz || !activeSessionId || !supabase) return undefined;
    const record = eventType => { void supabase.rpc('record_quiz_integrity_event', { p_session_id: activeSessionId, p_event_type: eventType }); };
    const onVisibility = () => record(document.hidden ? 'tab_hidden' : 'tab_visible');
    const onBlur = () => record('window_blur'); const onFocus = () => record('window_focus');
    const onOnline = () => { record('online'); setAnswers(current => ({ ...current })); }; const onOffline = () => record('offline');
    document.addEventListener('visibilitychange', onVisibility); window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [activeQuiz, activeSessionId]);

  useEffect(() => {
    let alive = true;
    async function makeUrls() {
      if (!supabase || !resources.length) { setResourceUrls({}); return; }
      const entries = await Promise.all(resources.map(async resource => {
        const { data } = await supabase.storage.from('subject-resources').createSignedUrl(resource.file_path, 3600);
        return [resource.id, data?.signedUrl || ''];
      }));
      if (alive) setResourceUrls(Object.fromEntries(entries));
    }
    void makeUrls();
    return () => { alive = false; };
  }, [resources]);

  useEffect(() => {
    let alive = true;
    async function makePaperUrls() {
      const papers = quizzes.filter(quiz => quiz.delivery_mode === 'written_paper' && quiz.question_file_path);
      if (!supabase || !papers.length) { setQuestionPaperUrls({}); return; }
      const entries = await Promise.all(papers.map(async quiz => {
        const { data, error } = await supabase.storage.from('assessment-papers').createSignedUrl(quiz.question_file_path, 3600, { download: quiz.question_file_name || true });
        return [quiz.id, error ? '' : data?.signedUrl || ''];
      }));
      if (alive) setQuestionPaperUrls(Object.fromEntries(entries));
    }
    void makePaperUrls();
    return () => { alive = false; };
  }, [quizzes]);

  const clearQuestionDraft = () => {
    setQuestionDraft({ question_text: '', question_type: 'mcq', options: ['', '', '', ''], option_label_style: 'letters', custom_option_labels: '', correct_option_index: 0, points: 1, explanation: '', topic_tags: '', difficulty: 'medium', rubric: '', pool_group: '', pool_pick_count: 1, save_to_bank: false });
    setEditingQuestionIndex(null);
  };

  const addQuestion = () => {
    if (!questionDraft.question_text.trim()) return toast.error('Enter the question text first.');
    if (questionDraft.question_text.trim().length > 5000) return toast.error('Keep question text under 5,000 characters.');
    const points = Number(questionDraft.points);
    if (!Number.isInteger(points) || points < 1 || points > 100) return toast.error('Points must be a whole number from 1 to 100.');
    let nextQuestion;
    if (['mcq', 'true_false'].includes(questionDraft.question_type)) {
      const choices = questionDraft.question_type === 'true_false' ? ['True', 'False'] : questionDraft.options;
      if (questionDraft.question_type === 'mcq' && (choices.length < 2 || choices.length > 6)) return toast.error('Multiple choice questions need 2 to 6 choices.');
      if (choices.some(option => !option.trim())) return toast.error('Fill every answer choice.');
      if (questionDraft.question_type === 'mcq' && questionDraft.option_label_style === 'custom' && (questionDraft.custom_option_labels.split(',').length !== choices.length || questionDraft.custom_option_labels.split(',').some(label => !label.trim()))) return toast.error('Enter one custom label for each answer choice.');
      nextQuestion = { ...questionDraft, options: choices, correct_option_index: Number(questionDraft.correct_option_index), points };
    } else {
      nextQuestion = { ...questionDraft, options: [''], correct_option_index: 0, points };
    }
    if (editingQuestionIndex === null) setQuestions(current => [...current, nextQuestion]);
    else setQuestions(current => current.map((question, index) => index === editingQuestionIndex ? nextQuestion : question));
    clearQuestionDraft();
    toast.success(editingQuestionIndex === null ? 'Question added.' : 'Question updated.');
  };

  function editQuestion(question, index) {
    setQuestionDraft({
      ...question,
      options: question.question_type === 'mcq' ? [...(question.options || [])] : ['', '', '', ''],
      option_label_style: question.option_label_style || 'none',
      topic_tags: Array.isArray(question.topic_tags) ? question.topic_tags.join(', ') : question.topic_tags || '',
      rubric: Array.isArray(question.rubric) ? question.rubric.map(item => typeof item === 'string' ? item : item.text).join('\n') : question.rubric || '',
    });
    setEditingQuestionIndex(index);
    document.querySelector('.question-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function moveQuestion(index, offset) {
    const destination = index + offset;
    if (destination < 0 || destination >= questions.length) return;
    setQuestions(current => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    if (editingQuestionIndex === index) setEditingQuestionIndex(destination);
    else if (editingQuestionIndex === destination) setEditingQuestionIndex(index);
  }

  function removeQuestion(index) {
    setQuestions(current => current.filter((_, questionIndex) => questionIndex !== index));
    if (editingQuestionIndex === index) clearQuestionDraft();
    else if (editingQuestionIndex !== null && editingQuestionIndex > index) setEditingQuestionIndex(current => current - 1);
  }

  function duplicateQuestion(question) {
    setQuestions(current => [...current, { ...question, save_to_bank: false }]);
    toast.success('Question duplicated. Edit the copy as needed.');
  }

  function applyAssessmentPreset(type) {
    const preset = ASSESSMENT_PRESETS[type];
    setAssessmentType(type); setTimeLimit(preset.minutes); setMaxAttempts(preset.attempts); setWeight(preset.weight);
  }

  function changeAssessmentFormat(format) {
    if (format === assessmentFormat) return;
    if ((questions.length || questionPaperFile) && !window.confirm('Switching the delivery format clears the questions or paper file currently added. Continue?')) return;
    setQuestions([]); clearQuestionDraft(); setQuestionPaperFile(null); setAssessmentFormat(format);
  }

  async function importQuestionsFromCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Keep the question CSV under 2 MB.');
      const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
      if (rows.length < 2) throw new Error('Add a header row and at least one question.');
      const headers = rows[0].map(header => header.trim().toLowerCase());
      if (!headers.includes('question') || !headers.includes('type')) throw new Error('CSV headers must include question and type. Download the template to see all supported columns.');
      if (rows.length - 1 > 100) throw new Error('Import up to 100 questions at a time.');
      const imported = rows.slice(1).map((cells, rowIndex) => {
        const cell = Object.fromEntries(headers.map((header, index) => [header, (cells[index] || '').trim()]));
        const typeAliases = { multiple_choice: 'mcq', 'multiple choice': 'mcq', tf: 'true_false', 'true/false': 'true_false', written: 'short_answer', essay: 'short_answer' };
        const rawType = (cell.type || 'mcq').toLowerCase();
        const question_type = ['mcq', 'true_false', 'short_answer'].includes(rawType) ? rawType : typeAliases[rawType];
        const question_text = cell.question || '';
        const points = Number(cell.points || 1);
        if (!question_text) throw new Error(`Row ${rowIndex + 2}: question is required.`);
        if (question_text.length > 5000) throw new Error(`Row ${rowIndex + 2}: question text exceeds 5,000 characters.`);
        if (!question_type) throw new Error(`Row ${rowIndex + 2}: use mcq, true_false, or short_answer for type.`);
        if (!Number.isInteger(points) || points < 1 || points > 100) throw new Error(`Row ${rowIndex + 2}: points must be a whole number from 1 to 100.`);

        let options = [''];
        let correct_option_index = 0;
        if (question_type === 'mcq') {
          options = (cell.choices || '').split('|').map(choice => choice.trim());
          if (options.length < 2 || options.length > 6 || options.some(choice => !choice)) throw new Error(`Row ${rowIndex + 2}: MCQ choices need 2 to 6 non-empty answers separated by |.`);
          if (cell.option_labels && (cell.option_labels.split(',').length !== options.length || cell.option_labels.split(',').some(label => !label.trim()))) throw new Error(`Row ${rowIndex + 2}: option_labels must provide one comma-separated label for each MCQ choice.`);
          const answer = cell.correct_answer || '';
          const textIndex = options.findIndex(choice => choice.toLowerCase() === answer.toLowerCase());
          correct_option_index = textIndex >= 0 ? textIndex : /^\d+$/.test(answer) ? Number(answer) : -1;
          if (correct_option_index < 0 || correct_option_index >= options.length) throw new Error(`Row ${rowIndex + 2}: correct_answer must match a choice or use its zero-based index.`);
        } else if (question_type === 'true_false') {
          options = ['True', 'False'];
          const answer = (cell.correct_answer || '').toLowerCase();
          correct_option_index = ['true', '0'].includes(answer) ? 0 : ['false', '1'].includes(answer) ? 1 : -1;
          if (correct_option_index < 0) throw new Error(`Row ${rowIndex + 2}: true_false correct_answer must be True or False.`);
        }
        return {
          question_text, question_type, options, correct_option_index, points,
          option_label_style: question_type === 'mcq' ? ((cell.option_labels || '').trim() ? 'custom' : 'letters') : 'none',
          custom_option_labels: cell.option_labels || '',
          explanation: cell.explanation || '', topic_tags: cell.topic_tags || '',
          difficulty: ['easy', 'medium', 'hard'].includes((cell.difficulty || '').toLowerCase()) ? cell.difficulty.toLowerCase() : 'medium',
          rubric: cell.rubric || '', pool_group: '', pool_pick_count: 1,
          save_to_bank: saveImportedQuestionsToBank,
        };
      });
      setQuestions(current => [...current, ...imported]);
      toast.success(`Added ${imported.length} question${imported.length === 1 ? '' : 's'} from CSV.`);
    } catch (error) { toast.error(error.message || 'Could not import this question CSV.'); }
  }

  function addBankQuestion() {
    const bankQuestion = subjectQuestionBank.find(question => question.id === bankSelection);
    if (!bankQuestion) return toast.error('Choose a question from this subject bank.');
    setQuestions(current => [...current, { question_text: bankQuestion.question_text, question_type: bankQuestion.question_type, options: bankQuestion.options, option_label_style: 'none', correct_option_index: bankQuestion.correct_option_index, points: bankQuestion.points, explanation: bankQuestion.explanation, topic_tags: bankQuestion.topic_tags || [], difficulty: bankQuestion.difficulty || 'medium', rubric: bankQuestion.rubric || [], save_to_bank: false }]);
    setBankSelection('');
  }

  async function saveAccommodation(event) {
    event.preventDefault();
    if (!accommodationDraft.quiz_id || !accommodationDraft.student_id) return toast.error('Choose an assessment and learner.');
    const payload = { school_id: profile.school_id, quiz_id: accommodationDraft.quiz_id, student_id: accommodationDraft.student_id,
      extra_time_minutes: Number(accommodationDraft.extra_time_minutes) || 0, extra_attempts: Number(accommodationDraft.extra_attempts) || 0,
      deadline_override: accommodationDraft.deadline_override ? new Date(accommodationDraft.deadline_override).toISOString() : null,
      note: accommodationDraft.note.trim() || null, updated_by: profile.id };
    const { error } = await supabase.from('quiz_accommodations').upsert(payload, { onConflict: 'quiz_id,student_id' });
    if (error) return toast.error(error.message || 'Could not save this accommodation.');
    setAccommodationDraft({ quiz_id: '', student_id: '', extra_time_minutes: 0, extra_attempts: 0, deadline_override: '', note: '' });
    toast.success('Assessment accommodation saved.'); await loadData();
  }

  async function removeAccommodation(id) {
    const { error } = await supabase.from('quiz_accommodations').delete().eq('id', id);
    if (error) return toast.error(error.message);
    setAccommodations(items => items.filter(item => item.id !== id)); toast.success('Accommodation removed.');
  }

  async function submitAppeal(event) {
    event.preventDefault();
    const result = results.find(item => item.id === newAppeal.result_id);
    if (!result || newAppeal.reason.trim().length < 5) return toast.error('Choose a result and explain your appeal.');
    const { data, error } = await supabase.from('quiz_appeals').insert({ school_id: profile.school_id, result_id: result.id, student_id: result.student_id, reason: newAppeal.reason.trim() }).select('*, quiz_results!inner(quiz_id, quizzes!inner(title,assessment_type,unit_title))').single();
    if (error) return toast.error(error.message || 'Could not submit this appeal.');
    setAppeals(items => [data, ...items]); setNewAppeal({ result_id: '', reason: '' }); toast.success('Mark review request sent to the teacher.');
  }

  async function updateAppeal(appeal) {
    const draft = appealDrafts[appeal.id] || {};
    const { error } = await supabase.rpc('resolve_quiz_appeal', {
      p_appeal_id: appeal.id, p_status: draft.status || 'reviewed', p_response: draft.response || '',
      p_adjusted_score: draft.status === 'adjusted' ? Number(draft.adjusted_score) : null
    });
    if (error) return toast.error(error.message || 'Could not update this appeal.');
    toast.success('Appeal decision saved.'); await loadData();
  }

  async function deleteBankQuestion(question) {
    const { error } = await supabase.from('quiz_question_bank').delete().eq('id', question.id);
    if (error) return toast.error(error.message);
    setBankQuestions(items => items.filter(item => item.id !== question.id));
  }

  async function backupAssessment(quiz) {
    const { data, error } = await supabase.from('quiz_questions').select('question_text,question_type,options,correct_option_index,points,explanation,sort_order,topic_tags,difficulty,rubric,pool_group,pool_pick_count').eq('quiz_id', quiz.id).order('sort_order');
    if (error) return toast.error(error.message || 'Could not export assessment backup.');
    const bundle = { format: 'smart-school-assessment-v1', assessment: {
      title: quiz.title, description: quiz.description, subject_id: quiz.subject_id, class_id: quiz.class_id,
      unit_title: quiz.unit_title, assessment_type: quiz.assessment_type, time_limit_minutes: quiz.time_limit_minutes,
      opens_at: quiz.opens_at, due_at: quiz.due_at, results_release_at: quiz.results_release_at, max_attempts: quiz.max_attempts,
      weight: quiz.weight, show_answers_after_submit: quiz.show_answers_after_submit,
      shuffle_questions: quiz.shuffle_questions, shuffle_options: quiz.shuffle_options
    }, questions: data || [] };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = blobUrl; link.download = `${quiz.title.replace(/[^a-z0-9_-]+/gi, '-')}-assessment.json`; link.click(); URL.revokeObjectURL(blobUrl);
  }

  async function restoreAssessment(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      if (bundle.format !== 'smart-school-assessment-v1' || !bundle.assessment?.subject_id || !Array.isArray(bundle.questions) || !bundle.questions.length || bundle.questions.length > 500) throw new Error('This is not a valid assessment backup.');
      const source = bundle.assessment;
      if (!subjects.some(subject => subject.id === source.subject_id) || (source.class_id && !classes.some(item => item.id === source.class_id))) throw new Error('The backup subject or class is not available in this school.');
      if (bundle.questions.some(question => !String(question.question_text || '').trim())) throw new Error('The backup includes a blank question.');
      const { data: quiz, error } = await supabase.from('quizzes').insert({
        school_id: profile.school_id, created_by: profile.id, title: String(source.title || 'Restored assessment').slice(0, 140),
        description: String(source.description || ''), subject_id: source.subject_id, class_id: source.class_id || null,
        unit_title: String(source.unit_title || 'Imported'), assessment_type: ASSESSMENT_TYPES.includes(source.assessment_type) ? source.assessment_type : 'quiz',
        time_limit_minutes: Math.min(600, Math.max(1, Number(source.time_limit_minutes) || 30)),
        opens_at: null, due_at: null, results_release_at: null, max_attempts: Math.min(10, Math.max(1, Number(source.max_attempts) || 1)),
        weight: Number(source.weight) || 1, show_answers_after_submit: Boolean(source.show_answers_after_submit),
        shuffle_questions: Boolean(source.shuffle_questions), shuffle_options: Boolean(source.shuffle_options), published: false
      }).select().single();
      if (error) throw error;
      const questionRows = bundle.questions.map((question, index) => ({
        quiz_id: quiz.id, question_text: String(question.question_text || '').slice(0, 5000),
        question_type: ['mcq', 'true_false', 'short_answer'].includes(question.question_type) ? question.question_type : 'mcq',
        options: Array.isArray(question.options) ? question.options : [],
        correct_option_index: Math.max(0, Number(question.correct_option_index) || 0),
        points: Math.max(1, Number(question.points) || 1), explanation: question.explanation || null,
        sort_order: index, topic_tags: Array.isArray(question.topic_tags) ? question.topic_tags : [],
        difficulty: ['easy', 'medium', 'hard'].includes(question.difficulty) ? question.difficulty : 'medium',
        rubric: Array.isArray(question.rubric) ? question.rubric : [], pool_group: question.pool_group || null,
        pool_pick_count: Math.min(100, Math.max(1, Number(question.pool_pick_count) || 1))
      }));
      if (questionRows.some(question => !question.question_text)) throw new Error('The backup includes a blank question.');
      const questionResult = await supabase.from('quiz_questions').insert(questionRows);
      if (questionResult.error) { await supabase.from('quizzes').delete().eq('id', quiz.id); throw questionResult.error; }
      toast.success('Assessment restored as a draft. Review its class and dates before publishing.');
      await loadData();
    } catch (error) { toast.error(error.message || 'Could not restore this assessment.'); }
  }

  function resetAssessmentForm() {
    setIsCreating(false); setTitle(''); setDescription(''); setSubjectId(''); setClassId(''); setUnitTitle('');
    setAssessmentType('quiz'); setAssessmentFormat('interactive'); setQuestionPaperFile(null); setTimeLimit(30); setOpensAt(''); setDueAt(''); setResultsReleaseAt(''); setMaxAttempts(1); setWeight(1);
    setShowAnswers(false); setShuffleQuestions(false); setShuffleOptions(false); setPublishNow(true); setQuestions([]); setSaveImportedQuestionsToBank(false); clearQuestionDraft();
  }

  async function saveAssessment(event) {
    event?.preventDefault?.();
    if (!supabase || !profile?.school_id) return toast.error('Connect this school to Supabase first.');
    if (!title.trim() || !unitTitle.trim()) return toast.error('Enter the assessment title and unit/topic.');
    if (!subjectId) return toast.error('Choose the subject for this assessment.');
    const isWrittenPaper = assessmentFormat === 'written_paper';
    const questionPaperMime = questionPaperFile ? paperMimeType(questionPaperFile) : '';
    if (isWrittenPaper && !questionPaperFile) return toast.error('Choose the written question paper file.');
    if (isWrittenPaper && (!questionPaperMime || questionPaperFile.size > 50 * 1024 * 1024)) return toast.error('Use a supported document, image, or text file up to 50 MB.');
    if (!isWrittenPaper && !questions.length) return toast.error('Add at least one question before publishing.');
    const poolGroups = Object.groupBy ? Object.groupBy(questions.filter(question => question.pool_group?.trim()), question => question.pool_group.trim()) : questions.filter(question => question.pool_group?.trim()).reduce((groups, question) => ((groups[question.pool_group.trim()] ||= []).push(question), groups), {});
    if (Object.values(poolGroups).some(group => group.length < Number(group[0].pool_pick_count) || group.some(question => Number(question.pool_pick_count) !== Number(group[0].pool_pick_count)))) return toast.error('Each random pool must have enough questions and use the same draw count.');
    if (opensAt && dueAt && new Date(dueAt) <= new Date(opensAt)) return toast.error('The deadline must be after the opening time.');
    setSavingAssessment(true);
    let createdQuizId;
    let uploadedPaperPath;
    try {
      const { data: quiz, error } = await supabase.from('quizzes').insert({
        school_id: profile.school_id, title: title.trim(), description: description.trim(), subject_id: subjectId,
        class_id: classId || null, unit_title: unitTitle.trim(), assessment_type: assessmentType,
        delivery_mode: assessmentFormat,
        time_limit_minutes: Number(timeLimit), opens_at: opensAt ? new Date(opensAt).toISOString() : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null, results_release_at: resultsReleaseAt ? new Date(resultsReleaseAt).toISOString() : null, max_attempts: Number(maxAttempts), weight: Number(weight) || 1,
        show_answers_after_submit: showAnswers, shuffle_questions: shuffleQuestions, shuffle_options: shuffleOptions,
        published: false, created_by: profile.id
      }).select().single();
      if (error) throw error;
      createdQuizId = quiz.id;
      if (isWrittenPaper) {
        const safeName = questionPaperFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-140) || 'question-paper';
        uploadedPaperPath = `${profile.school_id}/${quiz.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('assessment-papers').upload(uploadedPaperPath, questionPaperFile, { contentType: questionPaperMime, upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await supabase.from('quizzes').update({
          question_file_path: uploadedPaperPath, question_file_name: questionPaperFile.name.slice(0, 240), question_file_mime_type: questionPaperMime,
        }).eq('id', quiz.id);
        if (metadataError) throw metadataError;
      }
      const questionRows = isWrittenPaper ? [] : questions.map((question, index) => ({
        quiz_id: quiz.id, question_text: question.question_text, question_type: question.question_type,
        options: question.question_type === 'mcq' ? formatChoices(question) : question.options,
        correct_option_index: question.correct_option_index, points: question.points,
        explanation: question.explanation || null, sort_order: index,
        topic_tags: Array.isArray(question.topic_tags) ? question.topic_tags : question.topic_tags.split(',').map(tag => tag.trim()).filter(Boolean),
        difficulty: question.difficulty || 'medium', rubric: Array.isArray(question.rubric) ? question.rubric : question.rubric.split('\n').map(line => line.trim()).filter(Boolean).map((text, criterion_index) => ({ criterion_index, text })),
        pool_group: question.pool_group?.trim() || null, pool_pick_count: Number(question.pool_pick_count) || 1
      }));
      if (questionRows.length) {
        const { error: questionsError } = await supabase.from('quiz_questions').insert(questionRows);
        if (questionsError) throw questionsError;
      }
      const bankRows = (isWrittenPaper ? [] : questions).filter(question => question.save_to_bank).map(question => ({
        school_id: profile.school_id, subject_id: subjectId, unit_title: unitTitle.trim(), question_text: question.question_text,
        question_type: question.question_type, options: question.question_type === 'mcq' ? formatChoices(question) : question.options, correct_option_index: question.correct_option_index,
        points: question.points, explanation: question.explanation || null, created_by: profile.id,
        topic_tags: Array.isArray(question.topic_tags) ? question.topic_tags : question.topic_tags.split(',').map(tag => tag.trim()).filter(Boolean),
        difficulty: question.difficulty || 'medium', rubric: Array.isArray(question.rubric) ? question.rubric : question.rubric.split('\n').map(line => line.trim()).filter(Boolean).map((text, criterion_index) => ({ criterion_index, text }))
      }));
      if (bankRows.length) {
        const { error: bankError } = await supabase.from('quiz_question_bank').insert(bankRows);
        if (bankError) throw bankError;
      }
      if (publishNow) {
        const { error: publishError } = await supabase.from('quizzes').update({ published: true }).eq('id', quiz.id);
        if (publishError) throw publishError;
      }
      toast.success(publishNow ? (isWrittenPaper ? 'Written paper published. Assigned students can download it.' : 'Assessment published. MCQs will be auto-marked on submission.') : 'Assessment saved as a draft.');
      resetAssessmentForm();
      await loadData();
    } catch (error) {
      if (uploadedPaperPath) await supabase.storage.from('assessment-papers').remove([uploadedPaperPath]);
      if (createdQuizId) await supabase.from('quizzes').delete().eq('id', createdQuizId);
      console.error(error); toast.error(error.message || 'Could not save this assessment.');
    } finally { setSavingAssessment(false); }
  }

  async function startQuiz(quiz) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('get_quiz_questions', { p_quiz_id: quiz.id });
      if (error) throw error;
      if (!data?.length) return toast.error('This assessment has no questions.');
      const questionRows = data.map(item => ({ ...item, options: (item.options || []).map(option => typeof option === 'object' ? option : { index: item.options.indexOf(option), text: option }) }));
      const { data: cloudDraft, error: draftError } = await supabase.rpc('get_quiz_answer_drafts', { p_session_id: data[0].session_id });
      if (draftError) throw draftError;
      const savedAnswers = localStorage.getItem(`smartschool-assessment:${profile?.id}:${quiz.id}:${data[0].session_id}`);
      setQuizQuestions(questionRows);
      setActiveQuiz(quiz);
      setActiveSessionId(data[0].session_id);
      setExpiresAt(data[0].expires_at);
      setCurrentQuestionIdx(0); setAnswers({ ...(cloudDraft || {}), ...(savedAnswers ? JSON.parse(savedAnswers) : {}) }); setDraftSyncState('Saved securely'); setSummary(null); submitGuard.current = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) { toast.error(error.message || 'Could not start this assessment.'); }
  }

  const submitQuiz = useCallback(async (automatic = false) => {
    if (!activeQuiz || !activeSessionId || submitGuard.current || !supabase) return;
    submitGuard.current = true;
    setSubmitting(true);
    if (timerRef.current) window.clearInterval(timerRef.current);
    try {
      const { data, error } = await supabase.rpc('submit_quiz', { p_quiz_id: activeQuiz.id, p_answers: answers, p_session_id: activeSessionId });
      if (error) throw error;
      const result = data?.result || data;
      const answerKey = data?.answers || null;
      const keyById = Object.fromEntries((answerKey || []).map(item => [item.question_id, item]));
      setSummary({ score: Number(result.score || 0), total: Number(result.total_points || 0), needsReview: Boolean(result.needs_review), answerKey: keyById, pendingRelease: result.score == null, releaseAt: data?.release_at });
      localStorage.removeItem(`smartschool-assessment:${profile?.id}:${activeQuiz.id}:${activeSessionId}`);
      setActiveSessionId(null);
      toast.success(automatic ? 'Time is up. Your answers were submitted and marked.' : 'Submitted. Your MCQs were marked automatically.');
      await loadData();
    } catch (error) { submitGuard.current = false; toast.error(error.message || 'Could not submit answers.'); }
    finally { setSubmitting(false); }
  }, [activeQuiz, activeSessionId, answers, loadData, profile?.id]);
  submitQuizRef.current = submitQuiz;

  async function uploadResource(event) {
    event.preventDefault();
    if (!supabase || !resourceFile || !resourceForm.subject_id) return toast.error('Choose a subject and a PDF or PowerPoint file.');
    if (!RESOURCE_TYPES.has(resourceFile.type) || resourceFile.size > 50 * 1024 * 1024) return toast.error('Use a PDF or PowerPoint file up to 50 MB.');
    if (!resourceForm.unit_title.trim()) return toast.error('Add the unit or topic name.');
    setUploadingResource(true);
    const safeName = resourceFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const filePath = `${profile.school_id}/${crypto.randomUUID()}-${safeName}`;
    try {
      const { error: uploadError } = await supabase.storage.from('subject-resources').upload(filePath, resourceFile, { contentType: resourceFile.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from('subject_resources').insert({
        school_id: profile.school_id, subject_id: resourceForm.subject_id, class_id: resourceForm.class_id || null,
        unit_title: resourceForm.unit_title.trim(), title: resourceForm.title.trim() || resourceFile.name,
        description: resourceForm.description.trim(), file_path: filePath, file_name: resourceFile.name,
        mime_type: resourceFile.type, uploaded_by: profile.id
      });
      if (error) { await supabase.storage.from('subject-resources').remove([filePath]); throw error; }
      setResourceForm({ subject_id: '', class_id: '', unit_title: '', title: '', description: '' }); setResourceFile(null); setResourceFormOpen(false);
      await loadData(); toast.success('Subject resource uploaded.');
    } catch (error) { toast.error(error.message || 'Could not upload resource.'); }
    finally { setUploadingResource(false); }
  }

  async function deleteResource(resource) {
    if (!window.confirm(`Remove “${resource.title}”?`)) return;
    const { error: fileError } = await supabase.storage.from('subject-resources').remove([resource.file_path]);
    if (fileError) return toast.error(fileError.message || 'Could not remove the resource file.');
    const { error } = await supabase.from('subject_resources').delete().eq('id', resource.id);
    if (error) return toast.error(error.message);
    setResources(list => list.filter(item => item.id !== resource.id)); toast.success('Resource removed.');
  }

  async function saveManualMark(answer) {
    const points = Number(markDrafts[answer.id]?.points ?? answer.quiz_questions?.points ?? 0);
    const feedback = markDrafts[answer.id]?.feedback || '';
    const { error } = await supabase.rpc('grade_quiz_answer', { p_answer_id: answer.id, p_points: points, p_feedback: feedback });
    if (error) return toast.error(error.message || 'Could not save the mark.');
    toast.success('Response marked and the grade updated.'); await loadData();
  }

  async function saveSecondMark(answer) {
    const points = Number(markDrafts[answer.id]?.secondPoints ?? answer.earned_points ?? 0);
    const feedback = markDrafts[answer.id]?.secondFeedback || '';
    const { error } = await supabase.rpc('submit_second_quiz_mark', { p_answer_id: answer.id, p_points: points, p_feedback: feedback });
    if (error) return toast.error(error.message || 'Could not save the independent mark.');
    toast.success('Independent mark recorded. A second mark will trigger moderation.'); await loadData();
  }

  async function correctAnswerKey(question) {
    const draft = keyCorrectionDrafts[question.id] || {};
    if (Number(draft.correctIndex ?? question.correct_option_index) === Number(question.correct_option_index)) return toast.error('Choose a different correct answer before re-marking.');
    if ((draft.reason || '').trim().length < 5) return toast.error('Explain why the answer key is being corrected.');
    const { error } = await supabase.rpc('correct_mcq_answer_key', {
      p_question_id: question.id, p_correct_index: Number(draft.correctIndex ?? question.correct_option_index),
      p_explanation: draft.explanation ?? question.explanation ?? null, p_reason: draft.reason.trim()
    });
    if (error) return toast.error(error.message || 'Could not correct this answer key.');
    toast.success('Answer key corrected and previous attempts re-marked.'); await loadData();
  }

  const visibleQuizzes = useMemo(() => quizzes.filter(quiz => isStaff || quiz.published), [quizzes, isStaff]);
  const groupedResources = useMemo(() => resources.reduce((groups, resource) => {
    const key = `${resource.subjects?.name || 'Subject'} · ${resource.unit_title}`;
    (groups[key] ||= []).push(resource); return groups;
  }, {}), [resources]);
  const subjectQuestionBank = useMemo(() => bankQuestions.filter(question => question.subject_id === subjectId), [bankQuestions, subjectId]);
  const learningInsights = useMemo(() => {
    if (profile?.role !== 'student') return [];
    const latest = new Map();
    results.forEach(result => {
      const key = `${result.quiz_id}:${result.student_id}`;
      if (!latest.has(key) || Number(result.attempt_number) > Number(latest.get(key).attempt_number)) latest.set(key, result);
    });
    const topics = {};
    latest.forEach(result => {
      const quiz = result.quizzes || {};
      const key = `${quiz.subjects?.name || 'Subject'} · ${quiz.unit_title || 'General'}`;
      const topic = topics[key] || (topics[key] = { score: 0, total: 0, count: 0 });
      topic.score += Number(result.score) || 0; topic.total += Number(result.total_points) || 0; topic.count += 1;
    });
    return Object.entries(topics).map(([topic, value]) => ({ topic, count: value.count, percentage: value.total ? Math.round(value.score / value.total * 100) : 0 })).sort((a, b) => a.percentage - b.percentage);
  }, [profile?.role, results]);

  if (loading) return <div className="portal-loading"><div className="spinner" /><p>Loading assessments and subject resources…</p></div>;

  return (
    <main className={`assessment-page page-transition ${largeAssessmentText ? 'large-assessment-text' : ''} ${highContrastAssessment ? 'high-contrast-assessment' : ''}`}>
      <style>{`
        .assessment-page{max-width:1200px;margin:0 auto;padding:32px 22px 60px;color:var(--ink)}.assessment-page.large-assessment-text .quiz-taking{font-size:1.2rem}.assessment-page.high-contrast-assessment{--ink:#101010;--muted:#303030;--line:#555;--panel:#fff;--bg:#eee}
        .assessment-header,.assessment-card-head,.assessment-row,.quiz-taking-head,.quiz-actions,.section-title-row{display:flex;justify-content:space-between;align-items:center;gap:16px}
        .assessment-header{margin-bottom:26px}.assessment-header h1{margin:2px 0 8px}.assessment-header p{margin:0;color:var(--muted)}
        .assessment-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.8fr);gap:20px;align-items:start}
        .assessment-panel,.assessment-card,.question-panel,.resource-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:var(--shadow)}
        .assessment-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 20px}.assessment-preset{display:grid;gap:4px;text-align:left;padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink)}.assessment-preset[aria-pressed="true"]{border-color:var(--green);box-shadow:0 0 0 2px color-mix(in srgb,var(--green) 20%,transparent)}.assessment-preset small{color:var(--muted);line-height:1.35}.question-summary{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.question-summary-main{flex:1 1 240px}.question-summary-actions{display:flex;gap:6px}.question-count{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px;border-radius:10px;background:var(--bg);font-weight:700}.advanced-settings{border:1px solid var(--line);border-radius:12px;padding:14px;margin:14px 0}.advanced-settings summary{cursor:pointer;font-weight:700}.choice-editor{display:grid;gap:8px}.choice-row{display:flex;align-items:center;gap:8px}.choice-row input{flex:1}.question-helper{margin:6px 0;color:var(--muted);font-size:.88rem}
        .assessment-panel{margin-bottom:18px}.assessment-panel h2{margin-top:0}.assessment-grid,.resource-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:14px}
        .assessment-card{padding:17px}.assessment-card h3{margin:0}.assessment-card p{color:var(--muted);line-height:1.5}.assessment-meta{display:flex;flex-wrap:wrap;gap:7px;margin:13px 0;color:var(--muted);font-size:.82rem}.assessment-meta span{background:var(--bg);border-radius:20px;padding:5px 9px}
        .assessment-form,.resource-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.assessment-form label,.resource-form label,.question-editor label{display:grid;gap:6px;font-weight:650;font-size:.9rem}.assessment-form input,.assessment-form select,.assessment-form textarea,.resource-form input,.resource-form select,.resource-form textarea,.question-editor input,.question-editor select,.question-editor textarea,.mark-input{width:100%;min-width:0;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font:inherit}.assessment-form textarea,.resource-form textarea{min-height:80px;resize:vertical}.assessment-form .wide,.resource-form .wide{grid-column:1/-1}.check-row{display:flex;flex-wrap:wrap;gap:16px}.check-row label{display:flex;align-items:center;gap:8px;font-weight:500}.question-editor{padding:16px;border:1px dashed var(--line);border-radius:14px;margin:16px 0}.question-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.question-list{display:grid;gap:8px;margin:12px 0}.question-summary,.review-item{border:1px solid var(--line);border-radius:12px;padding:12px}.quiz-taking{max-width:850px;margin:0 auto}.timer-pill{font-size:1.2rem;font-weight:800;border-radius:10px;padding:10px 14px;background:var(--bg);color:var(--ink)}.timer-pill.urgent{color:#b42318;background:#fff1f0}.question-progress{height:8px;background:var(--bg);border-radius:99px;margin:18px 0;overflow:hidden}.question-progress span{height:100%;display:block;background:var(--green);transition:width .2s}.answer-choice{display:flex;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--line);border-radius:12px;margin:9px 0;cursor:pointer}.answer-choice.selected{border-color:var(--green);background:var(--cream)}.answer-choice input{margin-top:4px}.score-banner{text-align:center;padding:28px;border-radius:14px;background:var(--bg);margin:18px 0}.score-banner strong{display:block;font-size:2.4rem}.resource-group{margin:16px 0}.resource-card{padding:15px}.resource-card h4{margin:0 0 5px}.assessment-empty{color:var(--muted);padding:20px 0}.review-item textarea{margin:8px 0}.assessment-page button{cursor:pointer}.assessment-page button:disabled{opacity:.55;cursor:not-allowed}
        @media(max-width:850px){.assessment-layout{grid-template-columns:1fr}.assessment-header{align-items:flex-start;flex-direction:column}.assessment-form,.resource-form{grid-template-columns:1fr}.assessment-form .wide,.resource-form .wide{grid-column:auto}}
        @media(max-width:700px){.assessment-presets{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.assessment-page{padding:22px 12px 42px}.assessment-panel,.assessment-card,.question-panel{padding:16px}.quiz-taking-head,.assessment-row{align-items:flex-start;flex-direction:column}.question-options{grid-template-columns:1fr}.assessment-header button{width:100%}.quiz-actions{position:sticky;bottom:8px;background:var(--panel);padding:10px;border:1px solid var(--line);border-radius:12px;z-index:2}}
      `}</style>

      <header className="assessment-header">
        <div><p className="eyebrow">Subject learning</p><h1>Assessments & resources</h1><p>Create deadline-based CATs, quizzes, tests and exams; keep learning files organized by unit.</p></div>
        <div className="quiz-actions"><button className="button outline-button" onClick={() => navigate('/portal')}>← Portal</button>{isStaff && !isCreating && <><label className="button outline-button">Restore assessment<input type="file" accept="application/json,.json" hidden onChange={restoreAssessment} /></label><button className="button blue-button" onClick={() => setIsCreating(true)}>＋ Create assessment</button></>}</div>
      </header>

      {activeQuiz && !summary && <section className="assessment-panel quiz-taking" aria-live="polite">
        <div className="quiz-taking-head"><div><p className="eyebrow">{activeQuiz.assessment_type?.toUpperCase()} · {activeQuiz.subjects?.name}</p><h2>{activeQuiz.title}</h2><p>Question {currentQuestionIdx + 1} of {quizQuestions.length}</p><div className="quiz-actions"><button type="button" className="button outline-button" aria-pressed={largeAssessmentText} onClick={() => setLargeAssessmentText(value => !value)}>{largeAssessmentText ? 'Standard text' : 'Larger text'}</button><button type="button" className="button outline-button" aria-pressed={highContrastAssessment} onClick={() => setHighContrastAssessment(value => !value)}>{highContrastAssessment ? 'Standard contrast' : 'High contrast'}</button></div></div><div className={`timer-pill ${timeLeft < 60 ? 'urgent' : ''}`} aria-label="Time remaining">{formatTime(timeLeft)}</div></div>
        <div className="question-progress"><span style={{ width: `${((currentQuestionIdx + 1) / quizQuestions.length) * 100}%` }} /></div>
        <p aria-live="polite">{draftSyncState}. If offline, keep this page open; it will sync when your connection returns. Interruption signals are only context for staff review.</p>
        <h3 id="current-question-label">{quizQuestions[currentQuestionIdx]?.question_text}</h3>
        {['mcq', 'true_false'].includes(quizQuestions[currentQuestionIdx]?.question_type) ? <div>{quizQuestions[currentQuestionIdx]?.options?.map(option => <label key={option.index} className={`answer-choice ${String(answers[quizQuestions[currentQuestionIdx].id]) === String(option.index) ? 'selected' : ''}`}><input type="radio" name={`question-${quizQuestions[currentQuestionIdx].id}`} checked={String(answers[quizQuestions[currentQuestionIdx].id]) === String(option.index)} onChange={() => setAnswers(current => ({ ...current, [quizQuestions[currentQuestionIdx].id]: option.index }))} /><span>{option.text}</span></label>)}</div> : <label className="wide">Your response<textarea className="mark-input" rows="5" value={answers[quizQuestions[currentQuestionIdx]?.id] || ''} onChange={event => setAnswers(current => ({ ...current, [quizQuestions[currentQuestionIdx].id]: event.target.value }))} /></label>}
        <div className="quiz-actions" style={{ marginTop: 22 }}><button className="button outline-button" disabled={currentQuestionIdx === 0} onClick={() => setCurrentQuestionIdx(index => index - 1)}>Previous</button><span>{Object.keys(answers).filter(id => answers[id] !== '' && answers[id] != null).length} answered · {draftSyncState}</span>{currentQuestionIdx < quizQuestions.length - 1 ? <button className="button blue-button" onClick={() => setCurrentQuestionIdx(index => index + 1)}>Next</button> : <button className="button blue-button" disabled={submitting} onClick={() => { const unanswered = quizQuestions.filter(question => answers[question.id] == null || answers[question.id] === '').length; if (unanswered && !window.confirm(`${unanswered} question(s) are unanswered. Submit anyway?`)) return; void submitQuiz(false); }}>{submitting ? 'Submitting…' : 'Submit assessment'}</button>}</div>
      </section>}

      {summary && <section className="assessment-panel quiz-taking"><h2>Submission received</h2>{summary.pendingRelease ? <div className="score-banner"><strong>Score saved</strong><span>Your teacher will release the score{summary.releaseAt ? ` after ${localDateTime(summary.releaseAt)}` : ''}.</span></div> : <div className="score-banner"><strong>{summary.score} / {summary.total}</strong><span>MCQs were scored automatically by the system.</span></div>}{summary.needsReview && <p role="status">Written responses are waiting for teacher marking. Your grade will update when review is complete.</p>}{Object.keys(summary.answerKey || {}).length > 0 && <div><h3>Answer review</h3>{quizQuestions.map((question, index) => { const key = summary.answerKey[question.id]; return <p key={question.id}><b>{index + 1}. {question.question_text}</b><br />Correct answer: {question.options.find(option => option.index === key?.correct_option_index)?.text || '—'}{key?.explanation ? ` · ${key.explanation}` : ''}</p>; })}</div>}<button className="button blue-button" onClick={() => { setSummary(null); setActiveQuiz(null); setActiveSessionId(null); void loadData(); }}>Close</button></section>}

      {isCreating && <section className="assessment-panel"><div className="assessment-row"><div><p className="eyebrow">Teacher workspace</p><h2>New subject assessment</h2></div><button className="button outline-button" onClick={resetAssessmentForm}>Cancel</button></div>
        <form className="assessment-form" onSubmit={saveAssessment}>
          <div className="wide"><b>Choose a starting format</b><div className="assessment-presets">{ASSESSMENT_TYPES.map(type => <button type="button" key={type} className="assessment-preset" aria-pressed={assessmentType === type} onClick={() => applyAssessmentPreset(type)}><b>{type.toUpperCase()}</b><small>{ASSESSMENT_PRESETS[type].hint}</small><small>{ASSESSMENT_PRESETS[type].minutes} minutes · {ASSESSMENT_PRESETS[type].attempts} attempt(s)</small></button>)}</div></div>
          <div className="wide"><b>How students will complete it</b><div className="assessment-presets" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}><button type="button" className="assessment-preset" aria-pressed={assessmentFormat === 'interactive'} onClick={() => changeAssessmentFormat('interactive')}><b>Online questions</b><small>Students answer MCQ, true/false, or written questions in the portal. MCQs are auto-marked.</small></button><button type="button" className="assessment-preset" aria-pressed={assessmentFormat === 'written_paper'} onClick={() => changeAssessmentFormat('written_paper')}><b>Downloadable written paper</b><small>Attach a PDF or document. Students can download it from their own portal; parents cannot open or submit it.</small></button></div></div>
          <label>Title<input required maxLength="140" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Fractions CAT 1" /></label>
          <label>Subject<select required value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">Choose subject</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label>Class<select value={classId} onChange={event => setClassId(event.target.value)}><option value="">All classes</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Unit / topic<input required value={unitTitle} onChange={event => setUnitTitle(event.target.value)} placeholder="Unit 3: Fractions" /></label>
          <label>Time limit (minutes)<input type="number" min="1" max="600" required value={timeLimit} onChange={event => setTimeLimit(event.target.value)} /></label>
          <details className="wide advanced-settings"><summary>Advanced settings · schedule, grading and security</summary><div className="assessment-form" style={{ marginTop: 14 }}>
            <label>Opens at<input type="datetime-local" value={opensAt} onChange={event => setOpensAt(event.target.value)} /></label>
            <label>Submission deadline<input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
            <label>Release grades at (optional)<input type="datetime-local" value={resultsReleaseAt} onChange={event => setResultsReleaseAt(event.target.value)} /><small>Students will see their score after this time.</small></label>
            <label>Attempts allowed<input type="number" min="1" max="10" value={maxAttempts} onChange={event => setMaxAttempts(event.target.value)} /></label>
            <label>Gradebook weight<input type="number" min="0" step="0.1" value={weight} onChange={event => setWeight(event.target.value)} /></label>
            <label className="wide">Instructions<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Instructions and allowed materials" /></label>
            <div className="wide check-row"><label><input type="checkbox" checked={publishNow} onChange={event => setPublishNow(event.target.checked)} /> Publish now</label><label><input type="checkbox" checked={shuffleQuestions} onChange={event => setShuffleQuestions(event.target.checked)} /> Shuffle questions</label><label><input type="checkbox" checked={shuffleOptions} onChange={event => setShuffleOptions(event.target.checked)} /> Shuffle choices</label><label><input type="checkbox" checked={showAnswers} onChange={event => setShowAnswers(event.target.checked)} /> Show correct answers after submission</label></div>
          </div></details>
        </form>
        {assessmentFormat === 'interactive' ? <section className="question-editor"><h3>Add questions</h3><p>MCQ answer keys are stored privately and used by the server to mark submissions automatically.</p>
          <div className="assessment-row"><label>Add from this subject’s question bank<select value={bankSelection} onChange={event => setBankSelection(event.target.value)}><option value="">Choose a saved question</option>{subjectQuestionBank.map(item => <option key={item.id} value={item.id}>{item.unit_title} · {item.difficulty || 'medium'} · {(item.topic_tags || []).join(', ')} · {item.question_text.slice(0, 90)}</option>)}</select></label><button type="button" className="button outline-button" disabled={!bankSelection} onClick={addBankQuestion}>Add saved question</button></div>
          <div className="quiz-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}><button type="button" className="button outline-button" onClick={downloadQuestionTemplate}>Download CSV template</button><label className="button outline-button">Import up to 100 questions<input type="file" accept=".csv,text/csv" hidden onChange={importQuestionsFromCsv} /></label><label className="check-row"><input type="checkbox" checked={saveImportedQuestionsToBank} onChange={event => setSaveImportedQuestionsToBank(event.target.checked)} /> Save imported questions to the subject bank</label></div><p className="question-helper">Use the CSV template to bulk-create questions. MCQ choices use | separators; correct answers can be written as the exact choice or its zero-based index.</p>
          <div className="assessment-form"><label className="wide">Question<input autoFocus value={questionDraft.question_text} onChange={event => setQuestionDraft(item => ({ ...item, question_text: event.target.value }))} placeholder="Write your question here" /></label><label>Question type<select value={questionDraft.question_type} onChange={event => setQuestionDraft(item => ({ ...item, question_type: event.target.value, correct_option_index: 0 }))}><option value="mcq">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Written response (teacher marked)</option></select></label><label>Points<input type="number" min="1" max="100" value={questionDraft.points} onChange={event => setQuestionDraft(item => ({ ...item, points: event.target.value }))} /></label>
          {questionDraft.question_type === 'mcq' && <><label>Choice label format<select value={questionDraft.option_label_style} onChange={event => setQuestionDraft(item => ({ ...item, option_label_style: event.target.value }))}><option value="letters">A, B, C, D…</option><option value="lowercase">a, b, c, d…</option><option value="numbers">1, 2, 3, 4…</option><option value="roman">I, II, III, IV…</option><option value="custom">My own labels</option><option value="none">No labels</option></select></label>{questionDraft.option_label_style === 'custom' && <label>Custom labels<input value={questionDraft.custom_option_labels} onChange={event => setQuestionDraft(item => ({ ...item, custom_option_labels: event.target.value }))} placeholder="A), B), C), D), E)" /></label>}</>}
          {['mcq', 'true_false'].includes(questionDraft.question_type) && <><label>Correct answer<select value={questionDraft.correct_option_index} onChange={event => setQuestionDraft(item => ({ ...item, correct_option_index: event.target.value }))}>{(questionDraft.question_type === 'true_false' ? ['True', 'False'] : questionDraft.options).map((option, index) => <option key={index} value={index}>{questionDraft.question_type === 'mcq' ? formatChoices(questionDraft)[index] || `Choice ${index + 1}` : option || `Choice ${index + 1}`}</option>)}</select></label>{questionDraft.question_type === 'mcq' && <div className="wide choice-editor">{questionDraft.options.map((option, index) => <div className="choice-row" key={index}><input aria-label={`Choice ${index + 1}`} value={option} onChange={event => setQuestionDraft(item => ({ ...item, options: item.options.map((choice, choiceIndex) => choiceIndex === index ? event.target.value : choice) }))} placeholder={`Choice ${index + 1}`} />{questionDraft.options.length > 2 && <button type="button" className="button outline-button" aria-label={`Remove choice ${index + 1}`} onClick={() => setQuestionDraft(item => ({ ...item, options: item.options.filter((_, choiceIndex) => choiceIndex !== index), correct_option_index: Number(item.correct_option_index) >= index && Number(item.correct_option_index) > 0 ? Number(item.correct_option_index) - 1 : Number(item.correct_option_index) }))}>Remove</button>}</div>)}{questionDraft.options.length < 6 && <button type="button" className="button outline-button" onClick={() => setQuestionDraft(item => ({ ...item, options: [...item.options, ''] }))}>＋ Add answer choice</button>}</div>}</>}
          {questionDraft.question_type === 'short_answer' && <label className="wide">Marking rubric <textarea rows="3" value={questionDraft.rubric} onChange={event => setQuestionDraft(item => ({ ...item, rubric: event.target.value }))} placeholder="Optional: one marking point per line" /></label>}
          </div><details className="advanced-settings"><summary>Question bank and advanced question settings</summary><div className="assessment-form" style={{ marginTop: 14 }}><label>Difficulty<select value={questionDraft.difficulty} onChange={event => setQuestionDraft(item => ({ ...item, difficulty: event.target.value }))}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Topic tags<input value={questionDraft.topic_tags} onChange={event => setQuestionDraft(item => ({ ...item, topic_tags: event.target.value }))} placeholder="fractions, numerator" /></label><label>Random pool group<input value={questionDraft.pool_group} onChange={event => setQuestionDraft(item => ({ ...item, pool_group: event.target.value }))} placeholder="Optional: name shared alternatives" /></label>{questionDraft.pool_group && <label>Questions drawn from group<input type="number" min="1" max="100" value={questionDraft.pool_pick_count} onChange={event => setQuestionDraft(item => ({ ...item, pool_pick_count: event.target.value }))} /></label>}<label className="wide">Answer explanation (optional)<textarea rows="2" value={questionDraft.explanation} onChange={event => setQuestionDraft(item => ({ ...item, explanation: event.target.value }))} /></label></div><label className="check-row"><input type="checkbox" checked={questionDraft.save_to_bank} onChange={event => setQuestionDraft(item => ({ ...item, save_to_bank: event.target.checked }))} /> Save this question to my subject question bank</label></details><button type="button" className="button blue-button" onClick={addQuestion}>{editingQuestionIndex === null ? 'Add question to assessment' : 'Update question'}</button>{editingQuestionIndex !== null && <button type="button" className="button outline-button" onClick={clearQuestionDraft}>Cancel edit</button>}
          <div className="question-count"><span>{questions.length} question{questions.length === 1 ? '' : 's'} added</span><span>{questions.reduce((total, question) => total + (Number(question.points) || 0), 0)} points drafted{questions.some(question => question.pool_group?.trim()) ? ' (includes pool alternatives)' : ''}</span></div>
          <div className="question-list">{questions.map((question, index) => <div className="question-summary" key={`${index}-${question.question_text}`}><div className="question-summary-main"><b>{index + 1}. {question.question_text}</b><span> · {question.question_type.replace('_', ' ')} · {question.points} point(s){question.save_to_bank ? ' · saved to bank' : ''}</span>{question.options?.length > 1 && <details><summary>Review answer choices and key</summary><ol>{formatChoices(question).map((option, choiceIndex) => <li key={choiceIndex}>{option}{choiceIndex === Number(question.correct_option_index) ? ' · Correct answer' : ''}</li>)}</ol>{question.explanation && <p>{question.explanation}</p>}</details>}{question.question_type === 'short_answer' && question.rubric && <details><summary>Review marking rubric</summary><p>{Array.isArray(question.rubric) ? question.rubric.map(item => typeof item === 'string' ? item : item.text).join(' · ') : question.rubric}</p></details>}</div><div className="question-summary-actions"><button type="button" className="button outline-button" disabled={index === 0} onClick={() => moveQuestion(index, -1)} aria-label={`Move question ${index + 1} up`}>↑</button><button type="button" className="button outline-button" disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)} aria-label={`Move question ${index + 1} down`}>↓</button><button type="button" className="button outline-button" onClick={() => editQuestion(question, index)}>Edit</button><button type="button" className="button outline-button" onClick={() => duplicateQuestion(question)}>Duplicate</button><button type="button" className="button outline-button" onClick={() => removeQuestion(index)}>Remove</button></div></div>)}</div>
          {subjectQuestionBank.length > 0 && <details style={{ marginTop: 16 }}><summary>Manage {subjectQuestionBank.length} saved question(s)</summary>{subjectQuestionBank.map(item => <p key={item.id}>{item.unit_title} · {item.question_text} <button type="button" className="button outline-button" onClick={() => deleteBankQuestion(item)}>Remove</button></p>)}</details>}
        </section> : <section className="question-editor"><h3>Written question paper</h3><p>Upload the question paper file students should work from. This assessment will not open an online quiz; only the assigned student can download the paper.</p><label>Question paper · PDF, Office file, text, spreadsheet, or image · max 50 MB<input required type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.odt,.odp,.ods,.rtf,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/png,image/jpeg,image/webp" onChange={event => setQuestionPaperFile(event.target.files?.[0] || null)} /></label>{questionPaperFile && <p className="question-helper" role="status">Selected: {questionPaperFile.name} · {(questionPaperFile.size / (1024 * 1024)).toFixed(1)} MB</p>}</section>}
        <button type="button" className="button blue-button" disabled={savingAssessment} onClick={() => saveAssessment()}>{savingAssessment ? 'Saving…' : publishNow ? 'Publish assessment' : 'Save draft'}</button>
      </section>}

      {!activeQuiz && !summary && !isCreating && <div className="assessment-layout">
        <div>
          <section className="assessment-panel"><div className="section-title-row"><div><p className="eyebrow">Deadlines and scores</p><h2>Assessments</h2></div><select aria-label="Filter results" value={resultFilter} onChange={event => setResultFilter(event.target.value)}><option value="all">All types</option>{ASSESSMENT_TYPES.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select></div>
            {visibleQuizzes.filter(item => resultFilter === 'all' || item.assessment_type === resultFilter).length === 0 ? <p className="assessment-empty">No assessments yet.</p> : <div className="assessment-grid">{visibleQuizzes.filter(item => resultFilter === 'all' || item.assessment_type === resultFilter).map(quiz => {
              const ownResults = results.filter(result => result.quiz_id === quiz.id);
              const latest = ownResults[0];
              const accommodation = accommodations.find(item => item.quiz_id === quiz.id);
              const effectiveDueAt = accommodation?.deadline_override || quiz.due_at;
              const effectiveMaxAttempts = (quiz.max_attempts || 1) + (Number(accommodation?.extra_attempts) || 0);
              const quizResults = results.filter(item => item.quiz_id === quiz.id);
              const averagePercent = quizResults.length ? Math.round(quizResults.reduce((sum, item) => sum + (Number(item.total_points) ? Number(item.score) / Number(item.total_points) * 100 : 0), 0) / quizResults.length) : null;
              const now = Date.now(); const closed = effectiveDueAt && now > new Date(effectiveDueAt).getTime(); const notOpen = quiz.opens_at && now < new Date(quiz.opens_at).getTime();
              return <article className="assessment-card" key={quiz.id}><div className="assessment-card-head"><h3>{quiz.title}</h3><span className="badge">{(quiz.assessment_type || 'quiz').toUpperCase()}</span></div><p>{quiz.description || (quiz.delivery_mode === 'written_paper' ? 'Downloadable written paper' : 'Interactive assessment')}{quiz.unit_title ? ` · ${quiz.unit_title}` : ''}</p><div className="assessment-meta"><span>{quiz.subjects?.name || 'Subject'}</span>{quiz.classes?.name && <span>{quiz.classes.name}</span>}<span>{quiz.delivery_mode === 'written_paper' ? 'Suggested time: ' : ''}{quiz.time_limit_minutes || 30} min{quiz.delivery_mode !== 'written_paper' && accommodation?.extra_time_minutes ? ` + ${accommodation.extra_time_minutes} accommodated` : ''}</span>{quiz.delivery_mode !== 'written_paper' && <span>{effectiveMaxAttempts} attempt(s)</span>}</div><p><b>Opens:</b> {localDateTime(quiz.opens_at) || 'Now'}<br /><b>Due:</b> {localDateTime(effectiveDueAt) || 'No deadline'}</p>
                {profile?.role === 'student' ? <>{quiz.delivery_mode !== 'written_paper' && latest ? <p role="status"><b>Latest score:</b> {latest.score}/{latest.total_points}{latest.needs_review ? ' · Written answers in review' : ''} · Attempt {latest.attempt_number || 1}</p> : null}{quiz.delivery_mode === 'written_paper' ? questionPaperUrls[quiz.id] && !notOpen && !closed ? <a className="button blue-button" href={questionPaperUrls[quiz.id]} download={quiz.question_file_name || true}>Download question paper</a> : <button type="button" className="button blue-button" disabled>{notOpen ? 'Available when it opens' : closed ? 'Deadline passed' : 'Preparing secure download…'}</button> : <button className="button blue-button" disabled={Boolean(notOpen || closed || ownResults.length >= effectiveMaxAttempts)} onClick={() => startQuiz(quiz)}>{notOpen ? 'Not open yet' : closed ? 'Deadline passed' : ownResults.length ? 'Start next attempt' : 'Start assessment'}</button>}</> : <><p><b>{quizResults.length}</b> submission(s){averagePercent == null ? '' : ` · Class average ${averagePercent}%`}{integrityByQuiz[quiz.id] ? ` · ${integrityByQuiz[quiz.id]} interruption signal(s) to review` : ''}</p>{quiz.delivery_mode === 'written_paper' && questionPaperUrls[quiz.id] && <a className="button outline-button" href={questionPaperUrls[quiz.id]} target="_blank" rel="noreferrer">Open question paper</a>}{quiz.delivery_mode !== 'written_paper' && <button className="button outline-button" onClick={() => backupAssessment(quiz)}>Export backup</button>}</>}
              </article>;
            })}</div>}
          </section>
          <section className="assessment-panel"><div className="section-title-row"><div><p className="eyebrow">Learning materials</p><h2>Subject resources</h2></div>{isStaff && <button className="button outline-button" onClick={() => setResourceFormOpen(open => !open)}>{resourceFormOpen ? 'Close' : '＋ Add PDF / PowerPoint'}</button>}</div>
            {resourceFormOpen && <form className="resource-form" onSubmit={uploadResource}><label>Subject<select required value={resourceForm.subject_id} onChange={event => setResourceForm(item => ({ ...item, subject_id: event.target.value }))}><option value="">Choose subject</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Class<select value={resourceForm.class_id} onChange={event => setResourceForm(item => ({ ...item, class_id: event.target.value }))}><option value="">All classes</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Unit / topic<input required value={resourceForm.unit_title} onChange={event => setResourceForm(item => ({ ...item, unit_title: event.target.value }))} /></label><label>Display title<input value={resourceForm.title} onChange={event => setResourceForm(item => ({ ...item, title: event.target.value }))} /></label><label className="wide">Description<input value={resourceForm.description} onChange={event => setResourceForm(item => ({ ...item, description: event.target.value }))} /></label><label className="wide">PDF or PowerPoint (max 50 MB)<input required type="file" accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={event => setResourceFile(event.target.files?.[0] || null)} /></label><button className="button blue-button" disabled={uploadingResource}>{uploadingResource ? 'Uploading…' : 'Upload resource'}</button></form>}
            {!Object.keys(groupedResources).length ? <p className="assessment-empty">PDF and PowerPoint files added by teachers will appear here by subject and unit.</p> : Object.entries(groupedResources).map(([group, items]) => <div className="resource-group" key={group}><h3>{group}</h3><div className="resource-grid">{items.map(resource => <article className="resource-card" key={resource.id}><h4>{resource.title}</h4><p>{resource.description || resource.file_name}</p><div className="assessment-meta">{resource.classes?.name && <span>{resource.classes.name}</span>}<span>{new Date(resource.created_at).toLocaleDateString()}</span></div><div className="quiz-actions">{resourceUrls[resource.id] ? <a className="button outline-button" href={resourceUrls[resource.id]} target="_blank" rel="noreferrer">Open file</a> : <span>Preparing secure link…</span>}{isStaff && (profile.role === 'school_admin' || resource.uploaded_by === profile.id) && <button className="button outline-button" onClick={() => deleteResource(resource)}>Remove</button>}</div></article>)}</div></div>)}
          </section>
          {isStaff && <section className="assessment-panel"><div className="section-title-row"><div><p className="eyebrow">Assessment gradebook</p><h2>Recent submissions</h2></div></div>{!results.length ? <p className="assessment-empty">Student submissions will appear here.</p> : <div className="table-wrap"><table className="gb-table"><thead><tr><th>Student</th><th>Assessment</th><th>Subject / unit</th><th>Score</th><th>Attempt</th><th>Status</th></tr></thead><tbody>{results.map(result => <tr key={result.id}><td>{result.students?.profiles?.full_name || result.students?.admission_number || 'Student'}</td><td>{result.quizzes?.title}</td><td>{subjects.find(subject => subject.id === result.quizzes?.subject_id)?.name || '—'}{result.quizzes?.unit_title ? ` · ${result.quizzes.unit_title}` : ''}</td><td>{result.score}/{result.total_points}</td><td>{result.attempt_number || 1}</td><td>{result.needs_review ? 'Written answers pending' : 'Marked'}</td></tr>)}</tbody></table></div>}</section>}
        </div>
        <aside>
          {isStaff && <section className="assessment-panel"><details><summary><b>Correct an MCQ answer key</b></summary><p>Changing a key re-marks all earlier automatic answers and records who changed it and why.</p>{staffQuestions.filter(question => profile?.role === 'school_admin' || question.quizzes?.created_by === profile?.id).map(question => { const choices = Array.isArray(question.options) ? question.options : []; const draft = keyCorrectionDrafts[question.id] || {}; return <article className="review-item" key={question.id}><p>{question.quizzes?.title}</p><b>{question.question_text}</b><label>Correct answer<select className="mark-input" value={draft.correctIndex ?? question.correct_option_index} onChange={event => setKeyCorrectionDrafts(current => ({ ...current, [question.id]: { ...current[question.id], correctIndex: event.target.value } }))}>{choices.map((choice, index) => <option key={index} value={index}>{typeof choice === 'string' ? choice : choice.text || `Choice ${index + 1}`}</option>)}</select></label><label>Why is the key changing?<textarea className="mark-input" minLength="5" value={draft.reason ?? ''} onChange={event => setKeyCorrectionDrafts(current => ({ ...current, [question.id]: { ...current[question.id], reason: event.target.value } }))} /></label><button className="button outline-button" onClick={() => correctAnswerKey(question)}>Correct key and re-mark</button></article>; })}</details></section>}
          {isStaff && profile?.role === 'teacher' && <section className="assessment-panel"><p className="eyebrow">Moderation</p><h2>Second marking</h2><p>Independent marks are averaged with the first mark after both are entered.</p>{secondMarkQueue.length ? secondMarkQueue.map(answer => <article className="review-item" key={answer.id}><p>{answer.quiz_results?.quizzes?.title}</p><h3>{answer.quiz_questions?.question_text}</h3><p><b>First mark:</b> {answer.earned_points}/{answer.quiz_questions?.points}</p><p><b>Response:</b> {answer.answer_value || 'No response'}</p>{answer.quiz_questions?.rubric?.length > 0 && <ul>{answer.quiz_questions.rubric.map((criterion, index) => <li key={index}>{typeof criterion === 'string' ? criterion : criterion.text}</li>)}</ul>}<label>Independent mark (max {answer.quiz_questions?.points})<input className="mark-input" type="number" min="0" max={answer.quiz_questions?.points} step="any" value={markDrafts[answer.id]?.secondPoints ?? ''} onChange={event => setMarkDrafts(current => ({ ...current, [answer.id]: { ...current[answer.id], secondPoints: event.target.value } }))} /></label><label>Feedback<textarea className="mark-input" value={markDrafts[answer.id]?.secondFeedback ?? ''} onChange={event => setMarkDrafts(current => ({ ...current, [answer.id]: { ...current[answer.id], secondFeedback: event.target.value } }))} /></label><button className="button blue-button" onClick={() => saveSecondMark(answer)}>Submit independent mark</button></article>) : <p className="assessment-empty">No eligible independently marked answers.</p>}</section>}
          {profile?.role === 'student' && learningInsights.length > 0 && <section className="assessment-panel"><p className="eyebrow">Your progress</p><h2>Topics to revisit</h2>{learningInsights.map(item => <p key={item.topic}><b>{item.topic}</b> · {item.percentage}% across {item.count} assessment(s) {item.percentage < 60 ? '— practice this topic next.' : item.percentage >= 80 ? '— strong progress.' : '— keep practising.'}</p>)}</section>}
          {profile?.role === 'student' && <section className="assessment-panel"><p className="eyebrow">Mark review</p><h2>Appeal a result</h2><form className="resource-form" onSubmit={submitAppeal}><label className="wide">Assessment<select required value={newAppeal.result_id} onChange={event => setNewAppeal(item => ({ ...item, result_id: event.target.value }))}><option value="">Choose a marked result</option>{results.map(result => <option key={result.id} value={result.id}>{result.quizzes?.title} · {result.score}/{result.total_points}</option>)}</select></label><label className="wide">Why should this mark be reviewed?<textarea required minLength="5" maxLength="1500" value={newAppeal.reason} onChange={event => setNewAppeal(item => ({ ...item, reason: event.target.value }))} /></label><button className="button blue-button">Send appeal</button></form>{appeals.map(appeal => <article className="review-item" key={appeal.id}><b>{appeal.quiz_results?.quizzes?.title}</b><p>Status: {appeal.status}</p><p>{appeal.reason}</p>{appeal.response && <p>Teacher response: {appeal.response}</p>}</article>)}</section>}
          {isStaff && <section className="assessment-panel"><p className="eyebrow">Teacher review</p><h2>Written responses</h2>{!reviewQueue.length ? <p className="assessment-empty">No written answers waiting for marking.</p> : reviewQueue.map(answer => <article className="review-item" key={answer.id}><p>{answer.quiz_results?.quizzes?.title}</p><h3>{answer.quiz_questions?.question_text}</h3><p><b>Student answer:</b> {answer.answer_value || 'No response'}</p>{answer.quiz_questions?.rubric?.length > 0 && <div><b>Rubric</b><ul>{answer.quiz_questions.rubric.map((criterion, index) => <li key={index}>{typeof criterion === 'string' ? criterion : criterion.text}</li>)}</ul></div>}<label>Mark (max {answer.quiz_questions?.points})<input required className="mark-input" type="number" min="0" max={answer.quiz_questions?.points} step="any" value={markDrafts[answer.id]?.points ?? ''} onChange={event => setMarkDrafts(current => ({ ...current, [answer.id]: { ...current[answer.id], points: event.target.value } }))} /></label><label>Feedback<textarea className="mark-input" rows="2" value={markDrafts[answer.id]?.feedback ?? ''} onChange={event => setMarkDrafts(current => ({ ...current, [answer.id]: { ...current[answer.id], feedback: event.target.value } }))} /></label><button className="button blue-button" onClick={() => saveManualMark(answer)}>Save mark</button></article>)}</section>}
          {isStaff && <section className="assessment-panel"><p className="eyebrow">Accessibility</p><h2>Assessment accommodations</h2><p>Add extra time, attempts or an adjusted deadline for a specific learner.</p><form className="resource-form" onSubmit={saveAccommodation}><label className="wide">Assessment<select required value={accommodationDraft.quiz_id} onChange={event => setAccommodationDraft(item => ({ ...item, quiz_id: event.target.value }))}><option value="">Choose assessment</option>{quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></label><label className="wide">Learner<select required value={accommodationDraft.student_id} onChange={event => setAccommodationDraft(item => ({ ...item, student_id: event.target.value }))}><option value="">Choose learner</option>{students.filter(student => !accommodationDraft.quiz_id || !quizzes.find(quiz => quiz.id === accommodationDraft.quiz_id)?.class_id || student.class_id === quizzes.find(quiz => quiz.id === accommodationDraft.quiz_id)?.class_id).map(student => <option key={student.id} value={student.id}>{student.profiles?.full_name || student.admission_number}</option>)}</select></label><label>Extra minutes<input type="number" min="0" max="600" value={accommodationDraft.extra_time_minutes} onChange={event => setAccommodationDraft(item => ({ ...item, extra_time_minutes: event.target.value }))} /></label><label>Extra attempts<input type="number" min="0" max="5" value={accommodationDraft.extra_attempts} onChange={event => setAccommodationDraft(item => ({ ...item, extra_attempts: event.target.value }))} /></label><label className="wide">Adjusted deadline (optional)<input type="datetime-local" value={accommodationDraft.deadline_override} onChange={event => setAccommodationDraft(item => ({ ...item, deadline_override: event.target.value }))} /></label><label className="wide">Private staff note<input value={accommodationDraft.note} onChange={event => setAccommodationDraft(item => ({ ...item, note: event.target.value }))} /></label><button className="button blue-button">Save accommodation</button></form>{accommodations.map(item => <article className="review-item" key={item.id}><b>{item.students?.profiles?.full_name || 'Learner'}</b><p>{item.quizzes?.title} · +{item.extra_time_minutes} min · +{item.extra_attempts} attempt(s){item.deadline_override ? ` · until ${localDateTime(item.deadline_override)}` : ''}</p><button className="button outline-button" onClick={() => removeAccommodation(item.id)}>Remove</button></article>)}</section>}
          {isStaff && <section className="assessment-panel"><p className="eyebrow">Mark appeals</p><h2>Review requests</h2>{appeals.length ? appeals.map(appeal => <article className="review-item" key={appeal.id}><b>{appeal.students?.profiles?.full_name || 'Student'} · {appeal.quiz_results?.quizzes?.title}</b><p>{appeal.reason}</p><label>Decision<select className="mark-input" value={appealDrafts[appeal.id]?.status ?? appeal.status} onChange={event => setAppealDrafts(current => ({ ...current, [appeal.id]: { ...current[appeal.id], status: event.target.value } }))}><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="adjusted">Mark adjusted</option><option value="declined">Declined</option></select></label>{(appealDrafts[appeal.id]?.status ?? appeal.status) === 'adjusted' && <label>New score (max {appeal.quiz_results?.total_points})<input className="mark-input" type="number" min="0" max={appeal.quiz_results?.total_points} step="any" value={appealDrafts[appeal.id]?.adjusted_score ?? appeal.quiz_results?.score ?? ''} onChange={event => setAppealDrafts(current => ({ ...current, [appeal.id]: { ...current[appeal.id], adjusted_score: event.target.value } }))} /></label>}<label>Response and reason<textarea className="mark-input" rows="2" value={appealDrafts[appeal.id]?.response ?? appeal.response ?? ''} onChange={event => setAppealDrafts(current => ({ ...current, [appeal.id]: { ...current[appeal.id], response: event.target.value } }))} /></label><button className="button blue-button" onClick={() => updateAppeal(appeal)}>Save decision</button></article>) : <p className="assessment-empty">No mark review requests.</p>}</section>}
          <section className="assessment-panel"><p className="eyebrow">How marking works</p><h2>Automatic MCQ scoring</h2><p>When a learner submits, the database checks each MCQ against the teacher’s private answer key and stores the score immediately. The teacher does not need to be online.</p><p>Short answers are kept for teacher review. Deadlines, opening times, attempts, and timers are checked by the server. Integrity signals can help staff review interruptions; they do not prove misconduct by themselves.</p></section>
        </aside>
      </div>}
    </main>
  );
}
