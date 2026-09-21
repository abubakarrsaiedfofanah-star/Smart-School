import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const demoResponses = {
  'status': "The school is performing well. Attendance is at 94%, and fee collection is at 82% for this term. Grade 10A is currently the top-performing class.",
  'attendance': "Average attendance this week is 92.5%. There's a slight drop compared to last week (94%), mainly due to the sports event on Wednesday.",
  'reports': "I can help you generate previews for end-of-term reports. Based on current continuous assessment data, 65% of students are on track for an A or B grade.",
  'help': "I am your AI Concierge. I can give you school insights, or navigate you anywhere. Try saying 'Take me to the Library' or 'Open my Gradebook'.",
  'navigate_library': "Understood. Switching to the Study Library Repository...",
  'navigate_gradebook': "Opening the Interactive Gradebook module for you...",
  'navigate_settings': "Loading School Administration settings...",
  'navigate_quizzes': "Accessing the Examination and Quiz Portal..."
};

export default function AIGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([{ type: 'ai', text: "Hello! I am your SmartSchool 4.5 AI Concierge. How can I help you today?" }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);
  const { profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { type: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    // Simulate AI Processing
    setTimeout(() => {
      let response = "I'm still learning how to process that specific request. Try asking about 'status', 'attendance', or 'take me to the library'.";
      const lower = userMsg.toLowerCase();

      if (lower.includes('status') || lower.includes('doing')) response = demoResponses.status;
      else if (lower.includes('attendance')) response = demoResponses.attendance;
      else if (lower.includes('report')) response = demoResponses.reports;
      else if (lower.includes('help')) response = demoResponses.help;

      // Concierge Navigation Logic
      else if (lower.includes('take me to') || lower.includes('open') || lower.includes('show me')) {
        if (lower.includes('library')) { response = demoResponses.navigate_library; setTimeout(() => navigate('/library'), 1000); }
        else if (lower.includes('gradebook')) { response = demoResponses.navigate_gradebook; setTimeout(() => navigate('/gradebook'), 1000); }
        else if (lower.includes('settings')) { response = demoResponses.navigate_settings; setTimeout(() => navigate('/settings'), 1000); }
        else if (lower.includes('quiz')) { response = demoResponses.navigate_quizzes; setTimeout(() => navigate('/quizzes'), 1000); }
      }

      setMessages(prev => [...prev, { type: 'ai', text: response }]);
      setIsTyping(false);
    }, 1500);
  };

  const quickAsk = (text) => {
    setInput(text);
    // Trigger handleSend in the next tick
    setTimeout(() => {
       setMessages(prev => [...prev, { type: 'user', text: text }]);
       setIsTyping(true);
       setTimeout(() => {
         let response = demoResponses[Object.keys(demoResponses).find(k => text.toLowerCase().includes(k))] || demoResponses.help;
         setMessages(prev => [...prev, { type: 'ai', text: response }]);
         setIsTyping(false);
       }, 1200);
    }, 10);
  };

  return (
    <>
      <button className="ai-fab" onClick={() => setIsOpen(!isOpen)} aria-label="AI Assistant">
        <span>🧠</span>
      </button>

      {isOpen && (
        <div className="ai-chat-window glass-card">
          <header className="ai-header">
            <b>SmartSchool AI 4.5 Concierge</b>
            <button onClick={() => setIsOpen(false)}>×</button>
          </header>

          <div className="ai-messages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`ai-bubble ${m.type}`}>
                {m.text}
              </div>
            ))}
            {isTyping && <div className="ai-bubble ai typing">AI is thinking...</div>}
          </div>

          <div className="ai-suggestions">
            <button onClick={() => quickAsk("How is the school status?")}>School Status</button>
            <button onClick={() => quickAsk("Summarize attendance")}>Attendance</button>
          </div>

          <form className="ai-input" onSubmit={handleSend}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything..."
            />
            <button type="submit">→</button>
          </form>
        </div>
      )}

      <style>{`
        .ai-fab {
          position: fixed;
          bottom: 30px;
          right: 100px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2375e1 0%, #a855f7 100%);
          border: none;
          color: #fff;
          font-size: 1.5rem;
          cursor: pointer;
          z-index: 1000;
          box-shadow: 0 10px 25px rgba(35, 117, 225, 0.4);
          transition: all 0.3s;
          display: grid;
          place-items: center;
        }
        .ai-fab:hover { transform: scale(1.1) rotate(10deg); }

        .ai-chat-window {
          position: fixed;
          bottom: 100px;
          right: 30px;
          width: 350px;
          height: 500px;
          z-index: 1001;
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
        }

        .ai-header {
          padding: 15px 20px;
          background: #2375e1;
          color: #fff;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ai-header button {
          background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer;
        }

        .ai-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ai-bubble {
          max-width: 80%;
          padding: 10px 15px;
          border-radius: 15px;
          font-size: 0.9rem;
          line-height: 1.4;
        }
        .ai-bubble.ai { align-self: flex-start; background: var(--cream); color: var(--ink); border-bottom-left-radius: 2px; }
        .ai-bubble.user { align-self: flex-end; background: #2375e1; color: #fff; border-bottom-right-radius: 2px; }
        .ai-bubble.typing { opacity: 0.6; font-style: italic; font-size: 0.8rem; }

        .ai-suggestions {
          display: flex;
          gap: 8px;
          padding: 10px 20px;
          overflow-x: auto;
        }
        .ai-suggestions button {
          white-space: nowrap;
          padding: 6px 12px;
          border-radius: 20px;
          border: 1px solid var(--line);
          background: var(--bg);
          font-size: 0.75rem;
          cursor: pointer;
        }

        .ai-input {
          padding: 15px 20px;
          display: flex;
          gap: 10px;
          border-top: 1px solid var(--line);
        }
        .ai-input input {
          flex: 1;
          padding: 8px 15px;
          border-radius: 20px;
          border: 1px solid var(--line);
        }
        .ai-input button {
          width: 40px; height: 40px; border-radius: 50%; background: #2375e1; border: none; color: #fff; cursor: pointer;
        }

        @media (max-width: 600px) {
          .ai-chat-window { width: calc(100% - 40px); height: calc(100% - 150px); right: 20px; }
          .ai-fab { right: 20px; bottom: 160px; }
        }
      `}</style>
    </>
  );
}
