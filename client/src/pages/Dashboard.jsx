import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Trends from './Trends';
import Platforms from './Platforms';
import Jobs from './Jobs';

const platforms = ['General', 'LinkedIn', 'Instagram', 'YouTube'];

export default function Dashboard() {
    const [messages, setMessages] = useState([
        { role: 'ai', text: '👋 Hey! I\'m your SynapSocial AI Agent. Tell me what to post, upload a file, or pick a platform!' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [platform, setPlatform] = useState('General');
    const [activeNav, setActiveNav] = useState('chat');
    const [file, setFile] = useState(null);
    const [posting, setPosting] = useState(false);
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [showChats, setShowChats] = useState(true);
    const mediaFilesRef = useRef({});
    const bottomRef = useRef(null);
    const fileRef = useRef(null);
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
  // Check if Google OAuth just redirected with user data
  const params = new URLSearchParams(window.location.search);
  const googleUser = params.get('googleUser');
  
  if (googleUser) {
    const userData = JSON.parse(decodeURIComponent(googleUser));
    localStorage.setItem('user', JSON.stringify(userData));
    // Clean URL
    window.history.replaceState({}, '', '/dashboard');
    fetchChats();
    return;
  }

  const storedUser = localStorage.getItem('user');
  if (!storedUser || storedUser === '{}') {
    axios.get('${process.env.REACT_APP_API_URL}/api/auth/me', { withCredentials: true })
      .then(({ data }) => {
        localStorage.setItem('user', JSON.stringify({
          id: data.user._id, name: data.user.name, email: data.user.email
        }));
        window.history.replaceState({}, '', '/dashboard');
        fetchChats();
      }).catch(() => {
        window.location.href = '/login';
      });
  } else {
    fetchChats();
  }
}, []);

    useEffect(() => {
        const handleNav = (e) => setActiveNav(e.detail);
        window.addEventListener('navigate', handleNav);
        return () => window.removeEventListener('navigate', handleNav);
    }, []);

    const fetchChats = async () => {
        try {
            const { data } = await axios.get(`${process.env.REACT_APP_API_URL}/api/chats/${user.id}`);
            setChats(data.chats || []);
        } catch (err) { console.error(err); }
    };

    const startNewChat = () => {
        setActiveChatId(null);
        setMessages([{ role: 'ai', text: '👋 New chat started! What would you like to create today?' }]);
        setInput('');
        setFile(null);
    };

    const loadChat = async (chatId) => {
        try {
            const { data } = await axios.get(`${process.env.REACT_APP_API_URL}/api/chats/messages/${chatId}`);
            setActiveChatId(chatId);
            setMessages(data.chat.messages.map(m => ({
                role: m.role,
                text: m.text,
                showActions: m.showActions,
                fileType: m.fileType,
                fileName: m.fileName
            })));
        } catch (err) { console.error(err); }
    };

    const deleteChat = async (e, chatId) => {
        e.stopPropagation();
        await axios.delete(`${process.env.REACT_APP_API_URL}/api/chats/delete/${chatId}`);
        setChats(prev => prev.filter(c => c._id !== chatId));
        if (activeChatId === chatId) startNewChat();
    };

    const saveMessage = async (message, chatId, title) => {
        try {
            const { data } = await axios.post('${process.env.REACT_APP_API_URL}/api/chats/save', {
                chatId, userId: user.id, message, title
            });
            if (!chatId) {
                setActiveChatId(data.chat._id);
                fetchChats();
            }
            return data.chat._id;
        } catch (err) { console.error(err); }
    };

    const sendMessage = async () => {
        if (!input.trim() && !file) return;
        const userMsg = input.trim();
        const currentFile = file;
        setInput('');
        setFile(null);

        const fileExt = currentFile ? currentFile.name.split('.').pop().toLowerCase() : null;
        const fileType = fileExt
            ? ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt) ? 'image'
                : ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExt) ? 'video'
                    : ['pdf'].includes(fileExt) ? 'pdf'
                        : ['doc', 'docx'].includes(fileExt) ? 'doc'
                            : 'file' : null;

        // Generate msgId FIRST before using it
        const msgId = Date.now().toString();

        // Generate preview URL
        const previewUrl = currentFile && (fileType === 'image' || fileType === 'video')
            ? URL.createObjectURL(currentFile) : null;

        // Convert to base64 for LinkedIn posting
        if (currentFile && (fileType === 'image' || fileType === 'video')) {
            const fileBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(currentFile);
            });
            mediaFilesRef.current[msgId] = {
                base64: fileBase64,
                mimeType: currentFile.type,
                name: currentFile.name
            };
        }

        const displayText = currentFile
            ? `${userMsg ? userMsg : `Analyze this ${fileType}`}`
            : userMsg;

        const userMessage = {
            role: 'user',
            text: displayText,
            fileName: currentFile?.name,
            previewUrl: fileType === 'image' || fileType === 'video' ? previewUrl : null,
            fileType
        };
        setMessages(prev => [...prev, userMessage]);

        const title = userMsg.slice(0, 40) || currentFile?.name || 'New Chat';
        let currentChatId = activeChatId;

        if (!currentChatId) {
            const newChat = await axios.post('${process.env.REACT_APP_API_URL}/api/chats/new', { userId: user.id });
            currentChatId = newChat.data.chat._id;
            setActiveChatId(currentChatId);
            await axios.post('${process.env.REACT_APP_API_URL}/api/chats/save', {
                chatId: currentChatId,
                userId: user.id,
                message: { role: 'user', text: displayText, fileName: currentFile?.name, timestamp: new Date() },
                title
            });
            fetchChats();
        } else {
            await saveMessage({ role: 'user', text: displayText, fileName: currentFile?.name, timestamp: new Date() }, currentChatId);
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('message', userMsg || `Analyze this ${fileType} and generate ${platform} content`);
            formData.append('platform', platform);
            if (currentFile) formData.append('file', currentFile);

            const { data } = await axios.post(
                '${process.env.REACT_APP_API_URL}/api/ai/chat', formData,
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
            );

            const aiMsg = {
                role: 'ai',
                text: data.reply,
                showActions: true,
                content: data.reply,
                fileType,
                fileName: currentFile?.name,
                previewUrl: previewUrl,
                mediaId: msgId
            };
            setMessages(prev => [...prev, aiMsg]);

            if (fileType === 'image' || fileType === 'video') {
                const mediaMsg = {
                    role: 'ai',
                    text: fileType === 'image'
                        ? `📸 Would you like to post this image with the caption above?`
                        : `🎥 Would you like to post this video with the description above?`,
                    showMediaActions: true,
                    content: data.reply,
                    fileType,
                    fileName: currentFile?.name,
                    mediaId: msgId
                };
                setMessages(prev => [...prev, mediaMsg]);
            }

            await axios.post('${process.env.REACT_APP_API_URL}/api/chats/save', {
                chatId: currentChatId,
                userId: user.id,
                message: { role: 'ai', text: data.reply, showActions: true, fileType, fileName: currentFile?.name, timestamp: new Date() }
            });
            fetchChats();

        } catch {
            setMessages(prev => [...prev, { role: 'ai', text: '❌ AI error. Please try again.' }]);
        }
        setLoading(false);
    };

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const postToLinkedIn = async (content, mediaId = null) => {
  setPosting(true);
  try {
    const mediaData = mediaId ? mediaFilesRef.current[mediaId] : null;
    const isVideo = mediaData?.mimeType?.includes('video');

    if (mediaData && isVideo) {
      // Video — use FormData multipart
      const formData = new FormData();
      formData.append('userId', user.id);
      formData.append('content', content);

      // Convert base64 back to blob for FormData
      const base64Data = mediaData.base64.split(';base64,').pop();
      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const blob = new Blob([byteArray], { type: mediaData.mimeType });
      formData.append('media', blob, mediaData.name);

      await axios.post('${process.env.REACT_APP_API_URL}/api/ai/post/linkedin/video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } else {
      // Image or text — use JSON
      const postData = { userId: user.id, content };
      if (mediaData) {
        postData.mediaBase64 = mediaData.base64;
        postData.mediaMimeType = mediaData.mimeType;
        postData.mediaName = mediaData.name;
      }
      await axios.post('${process.env.REACT_APP_API_URL}/api/ai/post/linkedin', postData);
    }

    setMessages(prev => [...prev, {
      role: 'ai',
      text: `✅ Posted${mediaData ? (isVideo ? ' video' : ' image') : ''} to LinkedIn! 🎉`
    }]);
  } catch (err) {
    setMessages(prev => [...prev, {
      role: 'ai',
      text: `❌ ${err.response?.data?.message || 'LinkedIn post failed.'}`
    }]);
  }
  setPosting(false);
};

    const enhanceContent = async (content) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.post('${process.env.REACT_APP_API_URL}/api/ai/chat',
                { message: `Enhance and improve this content for ${platform}:\n\n${content}`, platform },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessages(prev => [...prev, { role: 'ai', text: data.reply, showActions: true, content: data.reply }]);
        } catch {
            setMessages(prev => [...prev, { role: 'ai', text: '❌ Error enhancing.' }]);
        }
        setLoading(false);
    };

    const formatTime = (date) => {
        const d = new Date(date);
        return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    };

    const user_ = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div style={s.container}>
            {/* Sidebar */}
            <div style={s.sidebar}>
                <h2 style={s.logo}>🧠 SynapSocial</h2>

                <div style={s.userInfo}>
                    <div style={s.avatar}>{user_.name?.[0] || 'U'}</div>
                    <div>
                        <p style={s.userName}>{user_.name || 'User'}</p>
                        <p style={s.userEmail}>{user_.email || ''}</p>
                    </div>
                </div>

                <nav style={s.nav}>
                    {[
                        { id: 'chat', icon: '💬', label: 'AI Chat' },
                        { id: 'trends', icon: '📈', label: 'Trends' },
                        { id: 'platforms', icon: '🔗', label: 'Platforms' },
                        { id: 'jobs', icon: '💼', label: 'Job Scanner' },
                        { id: 'schedule', icon: '📅', label: 'Schedule' },
                        { id: 'settings', icon: '⚙️', label: 'Settings' },
                        
                    ].map(item => (
                        <div key={item.id}
                            style={activeNav === item.id ? s.navActive : s.navItem}
                            onClick={() => setActiveNav(item.id)}>
                            {item.icon} {item.label}
                        </div>
                    ))}
                </nav>

                {/* Chat History */}
                {activeNav === 'chat' && (
                    <div style={s.chatHistory}>
                        <div style={s.chatHistoryHeader}>
                            <span style={s.chatHistoryTitle}>Recent Chats</span>
                            <button style={s.newChatBtn} onClick={startNewChat}>+ New</button>
                        </div>
                        <div style={s.chatList}>
                            {chats.length === 0 && <p style={s.noChats}>No chats yet</p>}
                            {chats.map(chat => (
                                <div key={chat._id}
                                    style={{ ...s.chatItem, background: activeChatId === chat._id ? '#7c3aed22' : 'transparent' }}
                                    onClick={() => loadChat(chat._id)}>
                                    <div style={s.chatItemContent}>
                                        <p style={s.chatItemTitle}>{chat.title}</p>
                                        <p style={s.chatItemDate}>{formatTime(chat.updatedAt)}</p>
                                    </div>
                                    <button style={s.deleteChatBtn} onClick={(e) => deleteChat(e, chat._id)}>🗑</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button style={s.logoutBtn} onClick={() => { localStorage.clear(); window.location.href = '/login'; }}>
                    🚪 Logout
                </button>
            </div>

            {/* Main */}
            <div style={s.main}>
                {activeNav === 'chat' && (
                    <>
                        <div style={s.header}>
                            <h3 style={s.headerTitle}>💬 AI Agent Console</h3>
                            <div style={s.platformRow}>
                                {platforms.map(p => (
                                    <button key={p} style={platform === p ? s.platActive : s.platBtn} onClick={() => setPlatform(p)}>{p}</button>
                                ))}
                            </div>
                        </div>

                        <div style={s.messages}>
                            {messages.map((msg, i) => (
                                <div key={i}>
                                    {/* User message */}
                                    {msg.role === 'user' && (
                                        <div style={s.userMsg}>
                                            {msg.fileName && <p style={s.fileChip}>📎 {msg.fileName}</p>}
                                            {msg.previewUrl && msg.fileType === 'image' && (
                                                <img src={msg.previewUrl} alt="uploaded" style={s.previewImg} />
                                            )}
                                            {msg.previewUrl && msg.fileType === 'video' && (
                                                <video src={msg.previewUrl} controls style={s.previewVideo} />
                                            )}
                                            {msg.text && <p style={s.msgText}>{msg.text}</p>}
                                        </div>
                                    )}

                                    {/* AI message */}
                                    {msg.role === 'ai' && (
                                        <div style={s.aiMsg}>
                                            <span style={s.aiLabel}>🧠 AI</span>
                                            {msg.previewUrl && msg.fileType === 'image' && (
                                                <img src={msg.previewUrl} alt="uploaded" style={s.previewImg} />
                                            )}
                                            {msg.previewUrl && msg.fileType === 'video' && (
                                                <video src={msg.previewUrl} controls style={s.previewVideo} />
                                            )}
                                            <p style={s.msgText}>{msg.text}</p>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    {msg.showActions && !msg.showMediaActions && (
                                        <div style={s.actionRow}>
                                            {(platform === 'LinkedIn' || platform === 'General') && (
                                                <button style={s.actionBtn('#0077b5')} onClick={() => postToLinkedIn(msg.content, msg.mediaId)} disabled={posting}>
                                                    💼 Post on LinkedIn
                                                </button>
                                            )}
                                            {(platform === 'Instagram' || platform === 'General') && (
                                                <button style={s.actionBtn('#e1306c')} disabled>
                                                    📸 Instagram <span style={s.soon}>Soon</span>
                                                </button>
                                            )}
                                            {(platform === 'YouTube' || platform === 'General') && (
                                                <button style={s.actionBtn('#ff0000')} disabled>
                                                    🎥 YouTube <span style={s.soon}>Soon</span>
                                                </button>
                                            )}
                                            <button style={s.actionBtn('#7c3aed')} onClick={() => enhanceContent(msg.content)}>
                                                ✨ Enhance
                                            </button>
                                            <button style={s.skipBtn}>⏭ Skip</button>
                                        </div>
                                    )}

                                    {/* Media post prompt */}
                                    {msg.showMediaActions && (
                                        <div style={s.mediaPromptBox}>
                                            <p style={s.mediaPromptTitle}>
                                                {msg.fileType === 'image' ? '📸 Post this image?' : '🎥 Post this video?'}
                                            </p>
                                            <p style={s.mediaPromptSub}>{msg.fileName} · with the {msg.fileType === 'image' ? 'caption' : 'description'} above</p>
                                            <div style={s.mediaPromptBtns}>
                                                <button style={s.mediaPostBtn('#0077b5')} onClick={() => postToLinkedIn(msg.content, msg.mediaId)} disabled={posting}>
                                                    💼 Post to LinkedIn
                                                </button>
                                                <button style={s.mediaPostBtn('#e1306c')} disabled>
                                                    📸 Instagram <span style={s.soon}>Soon</span>
                                                </button>
                                                <button style={s.mediaPostBtn('#ff0000')} disabled>
                                                    🎥 YouTube <span style={s.soon}>Soon</span>
                                                </button>
                                                <button style={s.mediaSkipBtn} onClick={() => {
                                                    setMessages(prev => prev.map((m, idx) =>
                                                        idx === i ? { ...m, showMediaActions: false } : m
                                                    ));
                                                }}>Skip for now</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {loading && (
                                <div style={s.aiMsg}>
                                    <span style={s.aiLabel}>🧠 AI</span>
                                    <p style={s.msgText}>✍️ Thinking...</p>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* File Preview */}
                        {file && (
                            <div style={s.filePreview}>
                                <span>📎 {file.name}</span>
                                <button style={s.removeFile} onClick={() => setFile(null)}>✕</button>
                            </div>
                        )}

                        {/* Input */}
                        <div style={s.inputWrapper}>
                            <input ref={fileRef} type="file" style={{ display: 'none' }}
                                accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                                onChange={e => setFile(e.target.files[0])} />
                            <button style={s.attachBtn} onClick={() => fileRef.current.click()} title="Upload file">📎</button>
                            <textarea
                                style={s.input} rows={2}
                                placeholder={`Ask AI to create ${platform} content...`}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKey}
                            />
                            <button style={s.sendBtn} onClick={sendMessage} disabled={loading}>↑</button>
                        </div>
                        <p style={s.hint}>📎 attach · Enter to send · Shift+Enter new line</p>
                    </>
                )}

                {activeNav === 'trends' && <Trends />}
                {activeNav === 'platforms' && <Platforms />}
                {activeNav === 'jobs' && <Jobs />}
                
                {activeNav === 'schedule' && <div style={s.comingSoon}><h2>📅 Scheduler</h2><p style={{ color: '#888' }}>Coming Soon!</p></div>}
                {activeNav === 'settings' && <div style={s.comingSoon}><h2>⚙️ Settings</h2><p style={{ color: '#888' }}>Coming Soon!</p></div>}
            </div>
        </div>
    );
}

const s = {
    container: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a0a0f', color: '#fff', fontFamily: 'sans-serif' },
    sidebar: { width: '220px', background: '#13131a', borderRight: '1px solid #2a2a3a', padding: '1rem 0.8rem', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
    logo: { color: '#a855f7', margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800 },
    userInfo: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', padding: '0.6rem', background: '#1e1e2e', borderRadius: '10px' },
    avatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 },
    userName: { margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#fff' },
    userEmail: { margin: 0, fontSize: '0.65rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' },
    nav: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
    navItem: { padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer', color: '#666', fontSize: '0.83rem' },
    navActive: { padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer', color: '#fff', fontSize: '0.83rem', background: '#7c3aed22', borderLeft: '3px solid #7c3aed' },
    chatHistory: { flex: 1, display: 'flex', flexDirection: 'column', marginTop: '0.8rem', overflow: 'hidden' },
    chatHistoryHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0 0.2rem' },
    chatHistoryTitle: { fontSize: '0.72rem', color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
    newChatBtn: { padding: '0.2rem 0.6rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 },
    chatList: { overflowY: 'auto', flex: 1 },
    noChats: { color: '#444', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.5rem' },
    chatItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.6rem', borderRadius: '8px', cursor: 'pointer', marginBottom: '0.2rem' },
    chatItemContent: { flex: 1, overflow: 'hidden' },
    chatItemTitle: { margin: 0, fontSize: '0.75rem', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    chatItemDate: { margin: 0, fontSize: '0.62rem', color: '#555' },
    deleteChatBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', opacity: 0.4, padding: '0.2rem' },
    logoutBtn: { padding: '0.6rem', background: 'transparent', color: '#444', border: '1px solid #1e1e2e', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem 1.5rem', height: '100vh', overflow: 'hidden' },
    header: { marginBottom: '0.6rem' },
    headerTitle: { margin: '0 0 0.6rem', color: '#fff', fontSize: '1rem' },
    platformRow: { display: 'flex', gap: '0.4rem' },
    platBtn: { padding: '0.3rem 0.8rem', background: 'transparent', color: '#888', border: '1px solid #2a2a3a', borderRadius: '20px', cursor: 'pointer', fontSize: '0.78rem' },
    platActive: { padding: '0.3rem 0.8rem', background: '#7c3aed', color: '#fff', border: '1px solid #7c3aed', borderRadius: '20px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 },
    messages: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.3rem', marginBottom: '0.8rem' },
    aiMsg: { background: '#13131a', border: '1px solid #2a2a3a', padding: '0.8rem 1rem', borderRadius: '12px', maxWidth: '72%', alignSelf: 'flex-start' },
    userMsg: { background: '#7c3aed22', border: '1px solid #7c3aed44', padding: '0.8rem 1rem', borderRadius: '12px', maxWidth: '72%', alignSelf: 'flex-end' },
    aiLabel: { fontSize: '0.7rem', color: '#a855f7', fontWeight: 700, display: 'block', marginBottom: '0.3rem' },
    msgText: { margin: 0, color: '#ccc', fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
    actionRow: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem', marginLeft: '0.3rem' },
    actionBtn: (color) => ({ padding: '0.3rem 0.7rem', background: `${color}22`, color: '#fff', border: `1px solid ${color}66`, borderRadius: '20px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }),
    skipBtn: { padding: '0.3rem 0.7rem', background: 'transparent', color: '#666', border: '1px solid #2a2a3a', borderRadius: '20px', cursor: 'pointer', fontSize: '0.72rem' },
    soon: { fontSize: '0.6rem', background: '#ffffff22', padding: '0.1rem 0.3rem', borderRadius: '4px', marginLeft: '3px' },
    mediaPromptBox: { background: '#13131a', border: '1px solid #7c3aed44', borderRadius: '12px', padding: '1rem', marginTop: '0.4rem', maxWidth: '72%' },
    mediaPromptTitle: { margin: '0 0 0.2rem', fontSize: '0.9rem', fontWeight: 700, color: '#fff' },
    mediaPromptSub: { margin: '0 0 0.8rem', fontSize: '0.75rem', color: '#888' },
    mediaPromptBtns: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
    mediaPostBtn: (color) => ({ padding: '0.4rem 0.8rem', background: color, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }),
    mediaSkipBtn: { padding: '0.4rem 0.8rem', background: 'transparent', color: '#888', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem' },
    filePreview: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.8rem', background: '#1e1e2e', borderRadius: '8px', marginBottom: '0.4rem', fontSize: '0.8rem', color: '#ccc' },
    removeFile: { background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' },
    inputWrapper: { display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '12px', padding: '0.4rem 0.8rem' },
    attachBtn: { padding: '0.4rem', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#666', flexShrink: 0 },
    input: { flex: 1, padding: '0.3rem 0', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.88rem', outline: 'none', resize: 'none', fontFamily: 'sans-serif' },
    sendBtn: { width: '32px', height: '32px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 900, fontSize: '1rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    hint: { color: '#333', fontSize: '0.7rem', margin: '0.3rem 0 0' },
    comingSoon: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    previewImg: { width: '100%', maxWidth: '320px', borderRadius: '8px', marginBottom: '0.6rem', display: 'block' },
    previewVideo: { width: '100%', maxWidth: '320px', borderRadius: '8px', marginBottom: '0.6rem', display: 'block' },
    fileChip: { fontSize: '0.75rem', color: '#888', margin: '0 0 0.3rem', background: '#1e1e2e', padding: '0.2rem 0.6rem', borderRadius: '6px', display: 'inline-block' },
};