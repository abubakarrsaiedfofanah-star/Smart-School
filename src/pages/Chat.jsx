import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Chat() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const [translated, setTranslated] = useState({}); // { msgId: isTranslated }

  const translateMsg = (id) => {
    setTranslated(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getTranslation = (body) => {
    const swahiliMap = {
      'Good morning': 'Habari za asubuhi',
      'How are you?': 'U hali gani?',
      'Thank you for the update.': 'Asante kwa taarifa.',
      'The meeting is at 10 AM.': 'Mkutano ni saa nne asubuhi.',
      'Please check the results.': 'Tafadhali kagua matokeo.'
    };
    return swahiliMap[body] || `[SW] ${body}`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!profile) return;

    const fetchContacts = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('school_id', profile.school_id)
        .neq('id', profile.id);

      if (error) {
        toast.error('Could not load contacts');
      } else {
        setContacts(data);
      }
      setLoading(false);
    };

    fetchContacts();
  }, [profile]);

  useEffect(() => {
    if (!selectedContact || !profile) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${selectedContact.id}),and(sender_id.eq.${selectedContact.id},recipient_id.eq.${profile.id})`)
        .order('created_at', { ascending: true });

      if (error) {
        toast.error('Could not load messages');
      } else {
        setMessages(data);
      }
    };

    fetchMessages();

    // Subscribe to real-time messages
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${profile.id}`
      }, (payload) => {
        if (payload.new.sender_id === selectedContact.id) {
          setMessages((prev) => [...prev, payload.new]);
        } else {
          toast.success('New message from another contact');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedContact, profile]);

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContact) return;

    const msg = {
      school_id: profile.school_id,
      sender_id: profile.id,
      recipient_id: selectedContact.id,
      body: newMessage.trim()
    };

    const { data, error } = await supabase.from('messages').insert(msg).select().single();

    if (error) {
      toast.error('Failed to send message');
    } else {
      setMessages((prev) => [...prev, data]);
      setNewMessage('');
    }
  };

  if (loading) return <div className="portal-loading"><div className="spinner"></div></div>;

  return (
    <div className="chat-layout page-transition">
      <style>{`
        .chat-layout { display: flex; height: 100vh; background: #fff; overflow: hidden; }
        .chat-sidebar { width: 320px; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; background: #f9fafb; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .sidebar-header h2 { font-size: 1.25rem; margin: 0; color: var(--ink); }
        .back-btn { background: none; border: none; color: var(--green); cursor: pointer; font-weight: 600; font-size: 0.875rem; }
        .contact-list { flex: 1; overflow-y: auto; }
        .contact-item { padding: 15px 20px; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 12px; }
        .contact-item:hover { background: #f3f4f6; }
        .contact-item.active { background: var(--cream); border-right: 3px solid var(--green); }
        .avatar { width: 40px; height: 40px; background: var(--green); color: #fff; border-radius: 50%; display: grid; place-items: center; font-weight: bold; }
        .contact-info b { display: block; font-size: 0.9375rem; color: var(--ink); }
        .contact-info small { color: var(--muted); text-transform: capitalize; }

        .chat-main { flex: 1; display: flex; flex-direction: column; background: #fff; }
        .chat-header { padding: 15px 25px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 15px; }
        .messages-container { flex: 1; overflow-y: auto; padding: 25px; display: flex; flex-direction: column; gap: 12px; background: #f8fafc; }
        .message { max-width: 70%; padding: 12px 16px; border-radius: 12px; font-size: 0.9375rem; line-height: 1.5; }
        .message.sent { align-self: flex-end; background: var(--green); color: #fff; border-bottom-right-radius: 2px; }
        .message.received { align-self: flex-start; background: #fff; color: var(--ink); border: 1px solid #e5e7eb; border-bottom-left-radius: 2px; }

        .translate-btn {
          background: none;
          border: none;
          font-size: 0.65rem;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          margin-top: 5px;
          display: block;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .message.received .translate-btn { color: var(--muted); }
        .translate-btn:hover { text-decoration: underline; color: #fff; }
        .message.received .translate-btn:hover { color: var(--green); }

        .chat-input-area { padding: 20px; border-top: 1px solid #e5e7eb; }
        .chat-input-form { display: flex; gap: 12px; }
        .chat-input-form input { flex: 1; padding: 12px 18px; border: 1px solid #e5e7eb; border-radius: 25px; font-size: 0.9375rem; }
        .chat-input-form button { padding: 10px 24px; border-radius: 25px; background: var(--green); color: #fff; border: none; font-weight: 600; cursor: pointer; }

        .no-selection { flex: 1; display: grid; place-items: center; color: var(--muted); text-align: center; }

        @media (max-width: 768px) {
          .chat-sidebar { width: 80px; }
          .sidebar-header h2, .contact-info, .back-btn span { display: none; }
          .sidebar-header { justify-content: center; }
        }
      `}</style>

      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <div>
            <h2>Messages</h2>
            {(profile?.role === 'school_admin' || profile?.role === 'teacher') && (
              <button
                className="broadcast-link"
                onClick={() => navigate('/broadcast')}
                style={{
                  fontSize: '0.75rem',
                  color: '#0066FF',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: '4px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'block'
                }}
              >
                📢 Bulk Broadcast
              </button>
            )}
          </div>
          <button className="back-btn" onClick={() => navigate('/portal')}>
             ← <span>Back</span>
          </button>
        </div>
        <div className="contact-list">
          {contacts.map(c => (
            <div
              key={c.id}
              className={`contact-item ${selectedContact?.id === c.id ? 'active' : ''}`}
              onClick={() => setSelectedContact(c)}
            >
              <div className="avatar">{c.full_name[0]}</div>
              <div className="contact-info">
                <b>{c.full_name}</b>
                <small>{c.role.replace('_', ' ')}</small>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="chat-main">
        {selectedContact ? (
          <>
            <header className="chat-header">
              <div className="avatar">{selectedContact.full_name[0]}</div>
              <div>
                <b>{selectedContact.full_name}</b>
                <small style={{display:'block', color:'var(--muted)'}}>{selectedContact.role.replace('_', ' ')}</small>
              </div>
            </header>

            <div className="messages-container">
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.sender_id === profile.id ? 'sent' : 'received'}`}>
                  <div className="msg-body">
                    {translated[m.id] ? getTranslation(m.body) : m.body}
                  </div>
                  <button
                    className="translate-btn"
                    onClick={() => translateMsg(m.id)}
                    title="Translate to Swahili"
                  >
                    🌐 {translated[m.id] ? 'Original' : 'Translate'}
                  </button>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <form className="chat-input-form" onSubmit={sendMessage}>
                <input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                />
                <button type="submit">Send</button>
              </form>
            </div>
          </>
        ) : (
          <div className="no-selection">
            <div>
              <div style={{fontSize:'3rem', marginBottom:'20px'}}>💬</div>
              <p>Select a contact to start messaging</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
