import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://synapsocial-api.onrender.com';

export default function Settings() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [saveMsg, setSaveMsg] = useState('');
  const [activeTab, setActiveTab] = useState('profile');

  // Profile
  const [profile, setProfile] = useState({ name: user.name || '', email: user.email || '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [savingPass, setSavingPass] = useState(false);

  // AI Tone
  const [aiTone, setAiTone] = useState(localStorage.getItem('aiTone') || 'professional');

  // Theme
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // Notifications
  const [notifs, setNotifs] = useState({
    emailNotifs: localStorage.getItem('notif_email') !== 'false',
    postSuccess: localStorage.getItem('notif_post') !== 'false',
    commentAlerts: localStorage.getItem('notif_comment') !== 'false',
  });

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    const r = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.body.style.background = '#f5f5f5';
      document.body.style.color = '#111';
    } else {
      document.body.style.background = '#0a0a0f';
      document.body.style.color = '#fff';
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const showSave = (msg) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 3000); };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await axios.post(`${API_URL}/api/auth/update-profile`, { userId: user.id, name: profile.name });
      const updated = { ...user, name: profile.name };
      localStorage.setItem('user', JSON.stringify(updated));
      showSave('✅ Profile saved!');
    } catch { showSave('❌ Failed to save'); }
    setSavingProfile(false);
  };

  const savePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) return showSave('❌ Fill all fields');
    if (passwords.new !== passwords.confirm) return showSave('❌ Passwords don\'t match');
    if (passwords.new.length < 6) return showSave('❌ Min 6 characters');
    setSavingPass(true);
    try {
      await axios.post(`${API_URL}/api/auth/change-password`, { userId: user.id, currentPassword: passwords.current, newPassword: passwords.new });
      setPasswords({ current: '', new: '', confirm: '' });
      showSave('✅ Password changed!');
    } catch (err) { showSave('❌ ' + (err.response?.data?.message || 'Failed')); }
    setSavingPass(false);
  };

  const saveAiTone = (tone) => {
    setAiTone(tone);
    localStorage.setItem('aiTone', tone);
    showSave('✅ AI tone updated!');
  };

  const saveNotifs = (key, value) => {
    const updated = { ...notifs, [key]: value };
    setNotifs(updated);
    localStorage.setItem(`notif_${key.replace('Notifs', 'email').replace('postSuccess', 'post').replace('commentAlerts', 'comment')}`, value);
    showSave('✅ Saved!');
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== user.email) return showSave('❌ Email doesn\'t match');
    try {
      await axios.delete(`${API_URL}/api/auth/delete-account`, { data: { userId: user.id } });
      localStorage.clear();
      window.location.href = '/login';
    } catch { showSave('❌ Delete failed'); }
  };

  const bg = theme === 'light' ? '#ffffff' : '#13131a';
  const bg2 = theme === 'light' ? '#f0f0f0' : '#1e1e2e';
  const border = theme === 'light' ? '#e0e0e0' : '#2a2a3a';
  const text = theme === 'light' ? '#111' : '#fff';
  const subtext = theme === 'light' ? '#555' : '#888';

  const tabs = [
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'ai', icon: '🤖', label: 'AI Settings' },
    { id: 'appearance', icon: '🎨', label: 'Appearance' },
    { id: 'notifications', icon: '🔔', label: 'Notifications' },
    { id: 'security', icon: '🔐', label: 'Security' },
    { id: 'danger', icon: '🗑️', label: 'Danger Zone' },
  ];

  const inp = { padding: '0.8rem', background: bg2, border: `1px solid ${border}`, borderRadius: '8px', color: text, fontSize: '0.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ flex: 1, padding: isMobile ? '1rem' : '1.5rem', overflowY: 'auto', color: text }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.2rem', fontSize: isMobile ? '1.2rem' : '1.4rem', color: text }}>⚙️ Settings</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: subtext }}>Manage your account and preferences</p>
        </div>
        {saveMsg && <span style={{ fontSize: '0.85rem', color: '#00ff88', background: '#00ff8811', padding: '0.4rem 1rem', borderRadius: '20px', border: '1px solid #00ff8833' }}>{saveMsg}</span>}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Sidebar tabs */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '0.3rem', minWidth: isMobile ? '100%' : '160px', flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: '0.6rem 0.8rem', background: activeTab === tab.id ? '#7c3aed22' : 'transparent', color: activeTab === tab.id ? '#a855f7' : subtext, border: activeTab === tab.id ? '1px solid #7c3aed44' : `1px solid transparent`, borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: activeTab === tab.id ? 600 : 400, textAlign: 'left', whiteSpace: 'nowrap' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: '16px', padding: '1.5rem' }}>

          {/* Profile */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, color: text }}>👤 Profile</h3>
              <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
                {profile.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.82rem', color: subtext }}>Full Name</label>
                <input style={inp} value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Your name" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.82rem', color: subtext }}>Email</label>
                <input style={{ ...inp, opacity: 0.6 }} value={profile.email} disabled placeholder="Email" />
                <p style={{ margin: 0, fontSize: '0.72rem', color: subtext }}>Email cannot be changed</p>
              </div>
              <button onClick={saveProfile} disabled={savingProfile}
                style={{ padding: '0.8rem', background: savingProfile ? '#333' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-start', minWidth: '140px' }}>
                {savingProfile ? '⏳ Saving...' : '💾 Save Profile'}
              </button>
            </div>
          )}

          {/* AI Settings */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, color: text }}>🤖 AI Tone Settings</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: subtext }}>Choose how the AI writes your content</p>
              {[
                { id: 'professional', label: '💼 Professional', desc: 'Formal, expert tone. Great for LinkedIn & B2B' },
                { id: 'casual', label: '😊 Casual', desc: 'Friendly, conversational. Perfect for Instagram' },
                { id: 'funny', label: '😂 Funny & Witty', desc: 'Humorous, engaging. Great for viral content' },
                { id: 'motivational', label: '🔥 Motivational', desc: 'Inspiring, energetic. Boosts engagement' },
                { id: 'educational', label: '📚 Educational', desc: 'Informative, clear. Best for tutorials & tips' },
              ].map(tone => (
                <div key={tone.id} onClick={() => saveAiTone(tone.id)}
                  style={{ padding: '1rem', background: aiTone === tone.id ? '#7c3aed22' : bg2, border: `2px solid ${aiTone === tone.id ? '#7c3aed' : border}`, borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: '0 0 0.2rem', fontWeight: 600, color: text, fontSize: '0.9rem' }}>{tone.label}</p>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: subtext }}>{tone.desc}</p>
                    </div>
                    {aiTone === tone.id && <span style={{ color: '#a855f7', fontSize: '1.2rem' }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Appearance */}
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, color: text }}>🎨 Appearance</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: subtext }}>Choose your preferred theme</p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'dark', label: '🌙 Dark Mode', desc: 'Easy on the eyes at night' },
                  { id: 'light', label: '☀️ Light Mode', desc: 'Clean and bright' },
                ].map(t => (
                  <div key={t.id} onClick={() => setTheme(t.id)}
                    style={{ flex: 1, minWidth: '140px', padding: '1.2rem', background: theme === t.id ? '#7c3aed22' : bg2, border: `2px solid ${theme === t.id ? '#7c3aed' : border}`, borderRadius: '12px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '1.5rem' }}>{t.id === 'dark' ? '🌙' : '☀️'}</p>
                    <p style={{ margin: '0 0 0.2rem', fontWeight: 600, color: text, fontSize: '0.9rem' }}>{t.id === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: subtext }}>{t.desc}</p>
                    {theme === t.id && <p style={{ margin: '0.5rem 0 0', color: '#a855f7', fontWeight: 700, fontSize: '0.8rem' }}>✓ Active</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, color: text }}>🔔 Notifications</h3>
              {[
                { key: 'emailNotifs', label: '📧 Email Notifications', desc: 'Get updates via email' },
                { key: 'postSuccess', label: '✅ Post Success Alerts', desc: 'Notify when AI posts successfully' },
                { key: 'commentAlerts', label: '💬 Comment Alerts', desc: 'Notify when new comments arrive' },
              ].map(n => (
                <div key={n.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: bg2, border: `1px solid ${border}`, borderRadius: '10px' }}>
                  <div>
                    <p style={{ margin: '0 0 0.2rem', fontWeight: 600, color: text, fontSize: '0.88rem' }}>{n.label}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: subtext }}>{n.desc}</p>
                  </div>
                  <div style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', position: 'relative', transition: 'background 0.3s', flexShrink: 0, background: notifs[n.key] ? '#7c3aed' : '#2a2a3a' }}
                    onClick={() => saveNotifs(n.key, !notifs[n.key])}>
                    <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', transition: 'transform 0.3s', transform: notifs[n.key] ? 'translateX(20px)' : 'translateX(2px)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Security */}
          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, color: text }}>🔐 Change Password</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: subtext }}>Update your account password</p>
              {[
                { key: 'current', label: 'Current Password', placeholder: 'Enter current password' },
                { key: 'new', label: 'New Password', placeholder: 'Min 6 characters' },
                { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.82rem', color: subtext }}>{f.label}</label>
                  <input type="password" style={inp} placeholder={f.placeholder} value={passwords[f.key]} onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <button onClick={savePassword} disabled={savingPass}
                style={{ padding: '0.8rem', background: savingPass ? '#333' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-start', minWidth: '160px' }}>
                {savingPass ? '⏳ Changing...' : '🔐 Change Password'}
              </button>
            </div>
          )}

          {/* Danger Zone */}
          {activeTab === 'danger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', color: '#ff4444' }}>🗑️ Danger Zone</h3>
              <div style={{ padding: '1.5rem', background: '#ff444411', border: '1px solid #ff444433', borderRadius: '12px' }}>
                <p style={{ margin: '0 0 0.5rem', fontWeight: 700, color: '#ff6666', fontSize: '0.95rem' }}>Delete Account</p>
                <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: subtext }}>This will permanently delete your account, all chats, and disconnect all platforms. This cannot be undone!</p>
                {!showDelete ? (
                  <button onClick={() => setShowDelete(true)}
                    style={{ padding: '0.7rem 1.5rem', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                    Delete My Account
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#ff6666' }}>Type your email <strong>{user.email}</strong> to confirm:</p>
                    <input style={{ ...inp, border: '1px solid #ff444466' }} placeholder={user.email} value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} />
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                      <button onClick={deleteAccount}
                        style={{ padding: '0.7rem 1.5rem', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                        Yes, Delete Forever
                      </button>
                      <button onClick={() => { setShowDelete(false); setDeleteConfirm(''); }}
                        style={{ padding: '0.7rem 1.5rem', background: 'transparent', color: subtext, border: `1px solid ${border}`, borderRadius: '8px', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}