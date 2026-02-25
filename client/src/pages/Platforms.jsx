import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
const API_URL = process.env.REACT_APP_API_URL || 'https://synapsocial-api.onrender.com';

const platformConfig = [
  {
    id: 'linkedin', name: 'LinkedIn', icon: '💼', color: '#0077b5',
    description: '', features: ['Auto Post', 'Reply Comments', 'Job Applications'],
    authUrl: `${API_URL}/api/platforms/linkedin`,
    permissions: [
      { key: 'linkedinAutoPost', label: '📤 Auto-Post', desc: 'AI posts on your behalf' },
      { key: 'linkedinReplyComments', label: '💬 Reply Comments', desc: 'AI replies to comments' },
      { key: 'linkedinSendDMs', label: '📩 Send DMs', desc: 'AI sends personalized DMs' },
      { key: 'autoApplyJobs', label: '💼 Auto-Apply Jobs', desc: 'AI finds jobs from your resume' },
    ]
  },
  {
    id: 'instagram', name: 'Instagram', icon: '📸', color: '#e1306c',
    description: '', features: ['Auto Post', 'Reel Upload', 'Reply Comments'],
    permissions: [
      { key: 'instagramAutoPost', label: '📤 Auto-Post', desc: 'AI posts images & reels' },
      { key: 'instagramReplyComments', label: '💬 Reply Comments', desc: 'AI replies to comments' },
    ]
  },
  {
    id: 'youtube', name: 'YouTube', icon: '🎥', color: '#ff0000',
    description: '', features: ['Upload Videos', 'Reply Comments', 'Auto Post'],
    authUrl: `${API_URL}/api/platforms/youtube/connect`,
    permissions: [
      { key: 'youtubeAutoPost', label: '🎥 Auto-Upload Videos', desc: 'AI uploads videos automatically' },
      { key: 'youtubeReplyComments', label: '💬 Auto-Reply Comments', desc: 'AI replies to comments automatically' },
    ]
  },
];

export default function Platforms() {
  const [connected, setConnected] = useState({ linkedin: false, instagram: false, youtube: false });
  const [permissions, setPermissions] = useState({ linkedinAutoPost: false, linkedinReplyComments: false, linkedinSendDMs: false, autoApplyJobs: false, instagramAutoPost: false, instagramReplyComments: false, youtubeAutoPost: false, youtubeReplyComments: false });
  const [expandedSettings, setExpandedSettings] = useState({});
  const [resume, setResume] = useState(null);
  const [resumeName, setResumeName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState('');
  const [ytModal, setYtModal] = useState(null);
  const [igModal, setIgModal] = useState(null);
  const [igTokenInput, setIgTokenInput] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const fileRef = useRef();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const r = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  useEffect(() => {
    fetchStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      setConnected(prev => ({ ...prev, [params.get('connected')]: true }));
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  const fetchStatus = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/platforms/status/${user.id}`);
      setConnected(data.platforms || {});
      setPermissions({
        linkedinAutoPost: data.permissions?.linkedinAutoPost || false,
        linkedinReplyComments: data.permissions?.linkedinReplyComments || false,
        linkedinSendDMs: data.permissions?.linkedinSendDMs || false,
        autoApplyJobs: data.permissions?.autoApplyJobs || false,
        instagramAutoPost: data.permissions?.instagramAutoPost || false,
        instagramReplyComments: data.permissions?.instagramReplyComments || false,
        youtubeAutoPost: data.permissions?.youtubeAutoPost || false,
        youtubeReplyComments: data.permissions?.youtubeReplyComments || false,
      });
      if (data.resumeName) setResumeName(data.resumeName);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const connectInstagram = async () => {
    if (!igTokenInput.trim()) return alert('Paste your Instagram access token!');
    try {
      await axios.post(`${API_URL}/api/instagram/connect`, { userId: user.id, accessToken: igTokenInput.trim() });
      setConnected(prev => ({ ...prev, instagram: true }));
      setIgModal(null);
      setIgTokenInput('');
      setSaveMsg('✅ Instagram Connected!');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || err.message));
    }
  };

  const connectPlatform = (platform) => {
    if (platform.id === 'instagram') { setIgModal('connect'); return; }
    window.location.href = `${platform.authUrl}?userId=${user.id}`;
  };

  const disconnectPlatform = async (platformId) => {
    if (platformId === 'instagram') {
      await axios.post(`${API_URL}/api/instagram/disconnect`, { userId: user.id });
    } else {
      await axios.post(`${API_URL}/api/platforms/disconnect`, { userId: user.id, platform: platformId });
    }
    setConnected(prev => ({ ...prev, [platformId]: false }));
  };

  const togglePermission = async (key) => {
    const updated = { ...permissions, [key]: !permissions[key] };
    setPermissions(updated);
    try {
      await axios.post(`${API_URL}/api/platforms/permissions`, { userId: user.id, permissions: updated });
      setSaveMsg('✅ Saved!'); setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('❌ Failed'); }
  };

  const toggleSettings = (platformId) => {
    setExpandedSettings(prev => ({ linkedin: false, instagram: false, youtube: false, [platformId]: !prev[platformId] }));
  };

  const handleResumeUpload = async () => {
    if (!resume) return;
    setUploading(true);
    const form = new FormData();
    form.append('resume', resume);
    try {
      const { data } = await axios.post(`${API_URL}/api/platforms/resume?userId=${user.id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResumeName(data.filename); setResume(null);
      setSaveMsg('✅ Resume uploaded!'); setTimeout(() => setSaveMsg(''), 2000);
    } catch { alert('Upload failed'); }
    setUploading(false);
  };

  if (loading) return <div style={{ color: '#888', padding: '2rem' }}>Loading platforms...</div>;

  return (
    <div style={{ flex: 1, padding: isMobile ? '1rem' : '1.5rem', overflowY: 'auto', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.4rem' }}>🔗 Platform Connections</h2>
        {saveMsg && <span style={{ fontSize: '0.85rem', color: '#00ff88', background: '#00ff8811', padding: '0.3rem 0.8rem', borderRadius: '20px' }}>{saveMsg}</span>}
      </div>
      <p style={{ color: '#888', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>Connect your social accounts and configure AI permissions per platform</p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {platformConfig.map(platform => (
          <div key={platform.id} style={{ background: '#13131a', border: `2px solid ${connected[platform.id] ? platform.color : '#2a2a3a'}`, borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', transition: 'border-color 0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                <span style={{ fontSize: '2rem' }}>{platform.icon}</span>
                <div>
                  <h3 style={{ margin: '0 0 0.2rem', fontSize: '1rem', color: '#fff' }}>{platform.name}</h3>
                </div>
              </div>
              <div style={{ padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', background: connected[platform.id] ? '#00ff8822' : '#ffffff11', color: connected[platform.id] ? '#00ff88' : '#888', border: `1px solid ${connected[platform.id] ? '#00ff8844' : '#2a2a3a'}` }}>
                {connected[platform.id] ? '✅ Connected' : '⚪ Not Connected'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {platform.features.map(f => <span key={f} style={{ padding: '0.25rem 0.6rem', background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '20px', fontSize: '0.72rem', color: '#888' }}>{f}</span>)}
            </div>

            {connected[platform.id] ? (
              <>
                <button style={{ width: '100%', padding: '0.6rem', background: '#1e1e2e', color: '#888', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left' }}
                  onClick={() => toggleSettings(platform.id)}>⚙️ Permissions {expandedSettings[platform.id] ? '▲' : '▼'}</button>

                {expandedSettings[platform.id] && platform.permissions && (
                  <div style={{ background: '#0d0d14', border: '1px solid #2a2a3a', borderRadius: '10px', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {platform.permissions.map(p => (
                      <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.3rem' }}>
                        <div>
                          <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{p.label}</p>
                          <p style={{ margin: 0, fontSize: '0.7rem', color: '#666' }}>{p.desc}</p>
                        </div>
                        <div style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', position: 'relative', transition: 'background 0.3s', flexShrink: 0, background: permissions[p.key] ? platform.color : '#2a2a3a' }}
                          onClick={() => togglePermission(p.key)}>
                          <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', transition: 'transform 0.3s', transform: permissions[p.key] ? 'translateX(20px)' : 'translateX(2px)' }} />
                        </div>
                      </div>
                    ))}

                    {platform.id === 'linkedin' && permissions.autoApplyJobs && (
                      <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '0.8rem', border: '1px dashed #7c3aed', marginTop: '0.3rem' }}>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#a855f7', fontWeight: 600 }}>📄 Resume for Job Scanning</p>
                        {resumeName && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.8rem', background: '#13131a', borderRadius: '6px', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#ccc' }}><span>📎 {resumeName}</span><span style={{ color: '#00ff88' }}>✅</span></div>}
                        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) setResume(e.target.files[0]); }} />
                        {resume && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.8rem', background: '#13131a', borderRadius: '6px', marginBottom: '0.4rem', fontSize: '0.8rem', color: '#ccc' }}><span>📎 {resume.name}</span><button style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }} onClick={() => setResume(null)}>✕</button></div>}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <button style={{ padding: '0.5rem 0.8rem', background: '#2a2a3a', color: '#fff', border: '1px solid #3a3a4a', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }} onClick={() => fileRef.current.click()}>📂 Choose</button>
                          {resume && <button style={{ padding: '0.5rem 0.8rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }} onClick={handleResumeUpload} disabled={uploading}>{uploading ? '⏳' : '✅ Submit'}</button>}
                        </div>
                      </div>
                    )}

                    {platform.id === 'instagram' && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                        <button style={{ flex: 1, padding: '0.5rem', background: '#e1306c22', color: '#e1306c', border: '1px solid #e1306c44', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }} onClick={() => setIgModal('comments')}>💬 Comments</button>
                        <button style={{ flex: 1, padding: '0.5rem', background: '#e1306c22', color: '#e1306c', border: '1px solid #e1306c44', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }} onClick={() => setIgModal('post')}>📸 Post</button>
                      </div>
                    )}

                    {platform.id === 'youtube' && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                        <button style={{ flex: 1, padding: '0.5rem', background: '#ff000022', color: '#ff6666', border: '1px solid #ff444444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }} onClick={() => setYtModal('comments')}>💬 Comments</button>
                        <button style={{ flex: 1, padding: '0.5rem', background: '#ff000022', color: '#ff6666', border: '1px solid #ff444444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }} onClick={() => setYtModal('upload')}>⬆️ Upload</button>
                      </div>
                    )}
                  </div>
                )}
                <button style={{ width: '100%', padding: '0.6rem', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                  onClick={() => disconnectPlatform(platform.id)}>Disconnect {platform.name}</button>
              </>
            ) : (
              <button style={{ width: '100%', padding: '0.75rem', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', marginTop: '0.3rem', background: platform.color }}
                onClick={() => connectPlatform(platform)}>Connect {platform.name} →</button>
            )}
          </div>
        ))}
      </div>

      {/* Instagram connect modal */}
      {igModal === 'connect' && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#13131a', border: '1px solid #e1306c44', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '480px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>📸 Connect Instagram</h3>
              <button onClick={() => setIgModal(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>
            <p style={{ color: '#888', fontSize: '0.85rem', margin: '0 0 1rem' }}>Paste your Instagram Business Access Token from Meta Developer Portal</p>
            <textarea style={{ width: '100%', padding: '0.8rem', background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '8px', color: '#fff', fontSize: '0.82rem', outline: 'none', resize: 'vertical', minHeight: '80px', boxSizing: 'border-box', fontFamily: 'monospace' }}
              placeholder="Paste access token here..." value={igTokenInput} onChange={e => setIgTokenInput(e.target.value)} />
            <button onClick={connectInstagram} style={{ width: '100%', padding: '0.8rem', background: '#e1306c', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, marginTop: '0.8rem' }}>
              🔗 Connect Instagram
            </button>
          </div>
        </div>
      )}

      {/* Instagram post modal */}
      {igModal === 'post' && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setIgModal(null)}>
          <div style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '500px', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>📸 Post to Instagram</h3>
              <button onClick={() => setIgModal(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>
            <IGPost userId={user.id} />
          </div>
        </div>
      )}

      {/* Instagram comments modal */}
      {igModal === 'comments' && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setIgModal(null)}>
          <div style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>💬 Instagram Comments</h3>
              <button onClick={() => setIgModal(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>
            <IGComments userId={user.id} />
          </div>
        </div>
      )}

      {/* YouTube modals */}
      {ytModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#000000aa', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setYtModal(null)}>
          <div style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>{ytModal === 'comments' ? '💬 YouTube Comments' : '⬆️ Upload Video'}</h3>
              <button style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.3rem' }} onClick={() => setYtModal(null)}>✕</button>
            </div>
            {ytModal === 'comments' && <YTComments userId={user.id} />}
            {ytModal === 'upload' && <YTUpload userId={user.id} />}
          </div>
        </div>
      )}
    </div>
  );
}

function IGPost({ userId }) {
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [posting, setPosting] = useState(false);
  const post = async () => {
    if (!imageUrl) return alert('Image URL required!');
    setPosting(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/instagram/post/image`, { userId, caption, imageUrl });
      alert('✅ ' + data.message);
      setCaption(''); setImageUrl('');
    } catch (err) { alert('❌ ' + (err.response?.data?.message || 'Post failed')); }
    setPosting(false);
  };
  const inputStyle = { padding: '0.8rem', background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#888' }}>⚠️ Instagram requires a public image URL (not a local file)</p>
      <input style={inputStyle} placeholder="Public Image URL (https://...)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
      <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'sans-serif' }} placeholder="Caption + hashtags" rows={3} value={caption} onChange={e => setCaption(e.target.value)} />
      <button onClick={post} disabled={posting || !imageUrl} style={{ padding: '0.9rem', background: posting || !imageUrl ? '#333' : '#e1306c', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
        {posting ? '⏳ Posting...' : '📸 Post to Instagram'}
      </button>
    </div>
  );
}

function IGComments({ userId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyLoading, setReplyLoading] = useState({});
  const [confirmPopup, setConfirmPopup] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/instagram/comments/${userId}`).then(({ data }) => setComments(data.comments || [])).catch(console.error).finally(() => setLoading(false));
  }, []);
  const getAiReply = async (comment) => {
    setReplyLoading(prev => ({ ...prev, [comment.id]: true }));
    try {
      const { data } = await axios.post(`${API_URL}/api/instagram/comment/ai-reply`, { comment: comment.text, mediaCaption: comment.mediaCaption });
      setConfirmPopup({ commentId: comment.id, reply: data.reply, comment });
    } catch { alert('❌ AI reply failed'); }
    setReplyLoading(prev => ({ ...prev, [comment.id]: false }));
  };
  const doPostReply = async (commentId, reply) => {
    try {
      await axios.post(`${API_URL}/api/instagram/comment/reply`, { userId, commentId, reply });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, replied: true } : c));
      setConfirmPopup(null);
    } catch (err) { alert('❌ ' + (err.response?.data?.message || 'Reply failed')); }
  };
  if (loading) return <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>⏳ Loading...</p>;
  if (!comments.length) return <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>No comments found.</p>;
  return (
    <div>
      <p style={{ margin: '0 0 0.8rem', fontSize: '0.78rem', color: '#888' }}>{comments.length} comments found</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '55vh', overflowY: 'auto' }}>
        {comments.map(c => (
          <div key={c.id} style={{ background: '#1e1e2e', borderRadius: '10px', padding: '1rem', border: '1px solid #2a2a3a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: '#fff' }}>👤 @{c.author}</p>
              {c.replied && <span style={{ fontSize: '0.7rem', background: '#00ff8822', color: '#00ff88', padding: '0.2rem 0.5rem', borderRadius: '10px' }}>✅ Replied</span>}
            </div>
            <p style={{ margin: '0 0 0.8rem', color: '#ccc', fontSize: '0.88rem', fontStyle: 'italic' }}>"{c.text}"</p>
            {!c.replied && <button disabled={replyLoading[c.id]} onClick={() => getAiReply(c)} style={{ padding: '0.35rem 0.9rem', background: '#e1306c22', color: '#e1306c', border: '1px solid #e1306c44', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>{replyLoading[c.id] ? '⏳' : '🧠 AI Reply'}</button>}
          </div>
        ))}
      </div>
      {confirmPopup && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem', maxWidth: '420px', width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff' }}>🧠 AI Reply Ready</h3>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#888' }}>Reply to <strong style={{ color: '#fff' }}>@{confirmPopup.comment.author}</strong>:</p>
            <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '0.8rem', marginBottom: '1rem', fontSize: '0.88rem', color: '#ccc', fontStyle: 'italic' }}>"{confirmPopup.reply}"</div>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button onClick={() => doPostReply(confirmPopup.commentId, confirmPopup.reply)} style={{ flex: 1, padding: '0.7rem', background: '#00ff88', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✅ Post It</button>
              <button onClick={() => setConfirmPopup(null)} style={{ flex: 1, padding: '0.7rem', background: 'transparent', color: '#888', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer' }}>❌ Skip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function YTComments({ userId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyLoading, setReplyLoading] = useState({});
  const [confirmPopup, setConfirmPopup] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/platforms/youtube/comments/${userId}`).then(({ data }) => {
      const now = Date.now();
      setComments((data.comments || []).filter(c => now - new Date(c.published).getTime() < 24 * 60 * 60 * 1000));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);
  const getAiReply = async (comment) => {
    setReplyLoading(prev => ({ ...prev, [comment.id]: true }));
    try {
      const { data } = await axios.post(`${API_URL}/api/platforms/youtube/comment/ai-reply`, { comment: comment.text, videoTitle: comment.videoTitle });
      setConfirmPopup({ commentId: comment.id, reply: data.reply, comment });
    } catch { alert('❌ AI reply failed'); }
    setReplyLoading(prev => ({ ...prev, [comment.id]: false }));
  };
  const doPostReply = async (commentId, reply) => {
    try {
      await axios.post(`${API_URL}/api/platforms/youtube/comment/reply`, { userId, commentId, reply });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, replied: true } : c));
      setConfirmPopup(null);
    } catch (err) { alert('❌ ' + (err.response?.data?.message || 'Reply failed')); }
  };
  if (loading) return <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>⏳ Loading...</p>;
  if (!comments.length) return <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>No comments in last 24 hours.</p>;
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '55vh', overflowY: 'auto' }}>
        {comments.map(c => (
          <div key={c.id} style={{ background: '#1e1e2e', borderRadius: '10px', padding: '1rem', border: '1px solid #2a2a3a' }}>
            <p style={{ margin: '0 0 0.2rem', fontWeight: 600, fontSize: '0.85rem', color: '#fff' }}>👤 {c.author}</p>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', color: '#555' }}>📹 {c.videoTitle}</p>
            <p style={{ margin: '0 0 0.8rem', color: '#ccc', fontSize: '0.88rem', fontStyle: 'italic' }}>"{c.text}"</p>
            {!c.replied && <button disabled={replyLoading[c.id]} onClick={() => getAiReply(c)} style={{ padding: '0.35rem 0.9rem', background: '#7c3aed22', color: '#a855f7', border: '1px solid #7c3aed44', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>{replyLoading[c.id] ? '⏳' : '🧠 AI Reply'}</button>}
          </div>
        ))}
      </div>
      {confirmPopup && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem', maxWidth: '420px', width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff' }}>🧠 AI Reply Ready</h3>
            <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '0.8rem', marginBottom: '1rem', fontSize: '0.88rem', color: '#ccc', fontStyle: 'italic' }}>"{confirmPopup.reply}"</div>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button onClick={() => doPostReply(confirmPopup.commentId, confirmPopup.reply)} style={{ flex: 1, padding: '0.7rem', background: '#00ff88', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✅ Post It</button>
              <button onClick={() => setConfirmPopup(null)} style={{ flex: 1, padding: '0.7rem', background: 'transparent', color: '#888', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer' }}>❌ Skip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function YTUpload({ userId }) {
  const [form, setForm] = useState({ title: '', description: '', tags: '' });
  const [videoFile, setVideoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const upload = async () => {
    if (!videoFile || !form.title) return alert('Title and video required!');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('video', videoFile); formData.append('userId', userId);
      formData.append('title', form.title); formData.append('description', form.description); formData.append('tags', form.tags);
      const { data } = await axios.post(`${API_URL}/api/platforms/youtube/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert(`✅ ${data.message}\n${data.videoUrl}`);
      setVideoFile(null); setForm({ title: '', description: '', tags: '' });
    } catch (err) { alert('❌ ' + (err.response?.data?.message || 'Upload failed')); }
    setUploading(false);
  };
  const inputStyle = { padding: '0.8rem', background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <input style={inputStyle} placeholder="Video Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
      <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'sans-serif' }} placeholder="Description" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      <input style={inputStyle} placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} />
      <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => setVideoFile(e.target.files[0])} />
      {videoFile
        ? <div style={{ padding: '0.7rem 1rem', background: '#1e1e2e', border: '1px solid #ff444433', borderRadius: '8px', fontSize: '0.85rem', color: '#ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>🎥 {videoFile.name}</span><button onClick={() => setVideoFile(null)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}>✕</button></div>
        : <button onClick={() => fileRef.current.click()} style={{ padding: '0.8rem', background: '#1e1e2e', color: '#888', border: '2px dashed #2a2a3a', borderRadius: '8px', cursor: 'pointer' }}>📂 Choose Video</button>
      }
      <button onClick={upload} disabled={uploading || !videoFile || !form.title} style={{ padding: '0.9rem', background: uploading || !videoFile || !form.title ? '#333' : '#ff0000', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
        {uploading ? '⏳ Uploading...' : '🚀 Upload to YouTube'}
      </button>
    </div>
  );
}