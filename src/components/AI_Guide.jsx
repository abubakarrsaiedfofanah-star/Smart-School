import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const personas = {
  concierge: { name: '🏫 School Concierge', placeholder: 'Ask about navigation, status, timetables...' },
  tutor: { name: '📚 Academic AI Tutor', placeholder: 'Ask any study question, math problem, or essay tip...' },
  insights: { name: '📈 Insights Advisor', placeholder: 'Ask about grades, attendance, or financial stats...' }
};

const personaResponses = {
  concierge: {
    'status': { text: "Connect your school account to view current school status and records.", action: null },
    'library': { text: "Opening the Digital Library Repository. You can access textbooks, research papers, and video lectures.", action: { label: 'Go to Library 📖', path: '/library' } },
    'gradebook': { text: "Navigating to your Interactive Gradebook to check subject scores and continuous assessment.", action: { label: 'Open Gradebook 📊', path: '/gradebook' } },
    'timetable': { text: "Here is your quick timetable access. Check your class schedules and room assignments.", action: { label: 'View Timetable 📅', path: '/timetable' } },
    'quizzes': { text: "Accessing the Quiz and Examination Portal. Ready to test your knowledge?", action: { label: 'Take Quiz ✍️', path: '/quizzes' } },
    'settings': { text: "Taking you to School Settings for configuration and permissions.", action: { label: 'School Settings ⚙️', path: '/settings' } }
  },
  tutor: {
    'math': { text: "In Algebra, remember the quadratic formula: x = (-b ± √(b² - 4ac)) / (2a). Would you like to practice a sample problem?", action: { label: 'Practice Quiz 📝', path: '/quizzes' } },
    'essay': { text: "For a strong essay: 1. Thesis statement in intro, 2. PEEL (Point, Evidence, Explanation, Link) paragraphs, 3. Synthesis in conclusion.", action: null },
    'science': { text: "Photosynthesis converts light energy into chemical energy: 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂. Need diagram notes?", action: { label: 'Browse Science Books 🧪', path: '/library' } },
    'study': { text: "Try the Pomodoro Technique: 25 minutes focused study, followed by a 5 minute break. Repeat 4 times then take a 20 min break!", action: null }
  },
  insights: {
    'attendance': { text: "Connect your school account to view attendance records.", action: null },
    'finance': { text: "Connect your school account to view fee and payment records.", action: null },
    'report': { text: "Connect your school account to view academic results.", action: null }
  }
};

export default function AIGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('concierge'); // concierge, tutor, insights
  const [messages, setMessages] = useState([
    { type: 'ai', text: "Hello! I am your SmartSchool AI 5.0 Intelligence Assistant. How can I assist you today?", action: null }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        toast.success(`Voice captured: "${transcript}"`);
      };

      recognition.onerror = (err) => {
        console.error('Speech recognition error', err);
        setIsListening(false);
        toast.error('Voice input error. Please try again.');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast('Listening... Speak now!', { icon: '🎙️' });
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const speakText = (text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // stop current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const processResponse = (userInput) => {
    const lower = userInput.toLowerCase();
    let result = { text: "I'm analyzing your request. Try asking about status, library, math homework, or attendance!", action: null };

    // Check current persona database
    const personaDb = personaResponses[mode];
    let matchedKey = Object.keys(personaDb).find(k => lower.includes(k));

    if (matchedKey) {
      result = personaDb[matchedKey];
    } else {
      // General cross-checking
      if (lower.includes('library') || lower.includes('book')) {
        result = { text: "Redirecting you to the Digital Library Repository.", action: { label: 'Go to Library 📖', path: '/library' } };
      } else if (lower.includes('grade') || lower.includes('score') || lower.includes('report')) {
        result = { text: "Checking academic performance metrics.", action: { label: 'Open Gradebook 📊', path: '/gradebook' } };
      } else if (lower.includes('calendar') || lower.includes('event')) {
        result = { text: "Opening the School Calendar for upcoming events and holidays.", action: { label: 'School Calendar 📅', path: '/calendar' } };
      } else if (lower.includes('chat') || lower.includes('message')) {
        result = { text: "Launching the SmartSchool Messaging & Chat Portal.", action: { label: 'Open Chat 💬', path: '/chat' } };
      } else if (lower.includes('hi') || lower.includes('hello')) {
        result = { text: `Greetings ${profile?.full_name || 'learner'}! How can I assist your school day today?`, action: null };
      }
    }

    return result;
  };

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { type: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response = processResponse(userMsg);
      setMessages(prev => [...prev, { type: 'ai', text: response.text, action: response.action }]);
      setIsTyping(false);
      speakText(response.text);
    }, 1000);
  };

  const quickAsk = (text) => {
    setMessages(prev => [...prev, { type: 'user', text }]);
    setIsTyping(true);
    setTimeout(() => {
      const response = processResponse(text);
      setMessages(prev => [...prev, { type: 'ai', text: response.text, action: response.action }]);
      setIsTyping(false);
      speakText(response.text);
    }, 900);
  };

  const handleActionClick = (path) => {
    if (path) {
      toast.success(`Navigating to ${path}...`);
      navigate(path);
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        className={`ai-fab ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle AI Assistant"
      >
        <span className="ai-fab-icon">🤖</span>
        <span className="ai-fab-badge">5.0</span>
      </button>

      {/* AI Chat Window */}
      {isOpen && (
        <div className="ai-chat-window glass-card page-transition">
          {/* Header */}
          <header className="ai-header">
            <div className="ai-header-info">
              <div className="ai-avatar-glowing">🤖</div>
              <div>
                <b>SmartSchool AI 5.0</b>
                <span className="ai-status-online">● Online</span>
              </div>
            </div>
            <div className="ai-header-controls">
              <button
                className={`icon-btn ${voiceEnabled ? 'active' : ''}`}
                onClick={() => {
                  setVoiceEnabled(!voiceEnabled);
                  toast(voiceEnabled ? 'Voice Reader Disabled' : 'Voice Reader Enabled', { icon: '🔊' });
                }}
                title="Toggle Text-to-Speech"
              >
                {voiceEnabled ? '🔊' : '🔇'}
              </button>
              <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
            </div>
          </header>

          {/* Mode Selector */}
          <div className="ai-mode-selector">
            {Object.keys(personas).map(key => (
              <button
                key={key}
                className={`mode-btn ${mode === key ? 'selected' : ''}`}
                onClick={() => {
                  setMode(key);
                  toast.success(`Switched to ${personas[key].name}`);
                }}
              >
                {personas[key].name}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="ai-messages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`ai-bubble ${m.type}`}>
                <div className="bubble-text">{m.text}</div>
                {m.action && (
                  <button
                    className="ai-action-btn"
                    onClick={() => handleActionClick(m.action.path)}
                  >
                    {m.action.label} →
                  </button>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="ai-bubble ai typing">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
          </div>

          {/* Contextual Quick Suggestions */}
          <div className="ai-suggestions">
            {mode === 'concierge' && (
              <>
                <button onClick={() => quickAsk("Show school status")}>📊 Status</button>
                <button onClick={() => quickAsk("Take me to the library")}>📖 Library</button>
                <button onClick={() => quickAsk("Open my gradebook")}>📈 Gradebook</button>
              </>
            )}
            {mode === 'tutor' && (
              <>
                <button onClick={() => quickAsk("Explain algebra math formula")}>📐 Math Help</button>
                <button onClick={() => quickAsk("How to write a great essay?")}>✍️ Essay Tips</button>
                <button onClick={() => quickAsk("Explain photosynthesis in science")}>🧪 Science Note</button>
              </>
            )}
            {mode === 'insights' && (
              <>
                <button onClick={() => quickAsk("Show attendance summary")}>📋 Attendance</button>
                <button onClick={() => quickAsk("Show finance overview")}>💳 Fee Stats</button>
                <button onClick={() => quickAsk("Generate report card preview")}>📄 Academic Report</button>
              </>
            )}
          </div>

          {/* Input Form */}
          <form className="ai-input" onSubmit={handleSend}>
            <button
              type="button"
              className={`voice-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleVoiceInput}
              title="Voice Input"
            >
              🎙️
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={personas[mode].placeholder}
            />
            <button type="submit" className="send-btn">→</button>
          </form>
        </div>
      )}

      <style>{`
        .ai-fab {
          position: fixed;
          bottom: 25px;
          right: 30px;
          width: 62px;
          height: 62px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
          border: 2px solid rgba(255, 255, 255, 0.2);
          color: #fff;
          font-size: 1.6rem;
          cursor: pointer;
          z-index: 1000;
          box-shadow: 0 10px 30px rgba(37, 99, 235, 0.4);
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ai-fab:hover { transform: scale(1.1) rotate(6deg); }
        .ai-fab.active { transform: scale(0.95); background: #1e293b; }
        .ai-fab-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #10b981;
          color: white;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 10px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }

        .ai-chat-window {
          position: fixed;
          bottom: 100px;
          right: 30px;
          width: 380px;
          height: 560px;
          z-index: 1001;
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
          background: var(--bg, #0f172a);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
        }

        .ai-header {
          padding: 14px 18px;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: #fff;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ai-header-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ai-avatar-glowing {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2563eb, #8b5cf6);
          display: grid;
          place-items: center;
          font-size: 1.2rem;
          box-shadow: 0 0 15px rgba(37, 99, 235, 0.6);
        }
        .ai-header b { display: block; font-size: 0.95rem; color: #f8fafc; }
        .ai-status-online { font-size: 0.7rem; color: #10b981; font-weight: 600; }

        .ai-header-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .icon-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          color: #fff;
          padding: 6px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .icon-btn.active { background: #2563eb; }
        .close-btn {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 1.6rem;
          cursor: pointer;
          line-height: 1;
        }
        .close-btn:hover { color: #fff; }

        .ai-mode-selector {
          display: flex;
          gap: 4px;
          padding: 8px 12px;
          background: rgba(15, 23, 42, 0.6);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          overflow-x: auto;
        }
        .mode-btn {
          flex: 1;
          padding: 6px 8px;
          font-size: 0.72rem;
          font-weight: 600;
          white-space: nowrap;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mode-btn.selected {
          background: rgba(37, 99, 235, 0.2);
          border-color: #2563eb;
          color: #60a5fa;
        }

        .ai-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ai-bubble {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 0.88rem;
          line-height: 1.45;
          animation: fadeIn 0.3s ease;
        }
        .ai-bubble.ai {
          align-self: flex-start;
          background: rgba(30, 41, 59, 0.8);
          color: #f1f5f9;
          border-bottom-left-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ai-bubble.user {
          align-self: flex-end;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #ffffff;
          border-bottom-right-radius: 4px;
        }
        .ai-bubble.typing {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 12px 20px;
        }
        .ai-bubble.typing .dot {
          width: 6px;
          height: 6px;
          background: #60a5fa;
          border-radius: 50%;
          animation: pulseDot 1.4s infinite ease-in-out both;
        }
        .ai-bubble.typing .dot:nth-child(1) { animation-delay: -0.32s; }
        .ai-bubble.typing .dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes pulseDot {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }

        .ai-action-btn {
          margin-top: 10px;
          display: inline-block;
          padding: 6px 12px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
        }
        .ai-action-btn:hover { background: #1d4ed8; }

        .ai-suggestions {
          display: flex;
          gap: 6px;
          padding: 8px 12px;
          overflow-x: auto;
          background: rgba(15, 23, 42, 0.4);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .ai-suggestions button {
          white-space: nowrap;
          padding: 5px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(30, 41, 59, 0.6);
          color: #cbd5e1;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-suggestions button:hover {
          background: #2563eb;
          color: white;
        }

        .ai-input {
          padding: 12px 14px;
          display: flex;
          gap: 8px;
          background: #0f172a;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          align-items: center;
        }
        .voice-mic-btn {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          padding: 8px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.2s;
        }
        .voice-mic-btn.listening {
          background: #ef4444;
          box-shadow: 0 0 10px #ef4444;
          animation: pulseMic 1s infinite;
        }
        @keyframes pulseMic {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }

        .ai-input input {
          flex: 1;
          padding: 10px 14px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(30, 41, 59, 0.8);
          color: #fff;
          font-size: 0.85rem;
          outline: none;
        }
        .ai-input input::placeholder { color: #64748b; }
        .ai-input input:focus { border-color: #2563eb; }

        .send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #2563eb;
          border: none;
          color: #fff;
          font-size: 1.1rem;
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        @media (max-width: 600px) {
          .ai-chat-window {
            width: calc(100vw - 32px);
            height: calc(100vh - 120px);
            right: 16px;
            bottom: 80px;
          }
          .ai-fab { right: 16px; bottom: 20px; }
        }
      `}</style>
    </>
  );
}
