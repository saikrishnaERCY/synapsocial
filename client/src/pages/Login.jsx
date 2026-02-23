import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const [mode, setMode] = useState('home');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5000/api/auth/google';
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSignup = async () => {
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      const { data } = await axios.post('http://localhost:5000/api/auth/signup', {
        name: form.name, email: form.email, password: form.password
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed');
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post('http://localhost:5000/api/auth/login', {
        email: form.email, password: form.password
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h2 style={s.logo}>🧠 SynapSocial</h2>
        <p style={s.tagline}>Your Autonomous AI Social Media Agent</p>

        <button style={s.googleBtn} onClick={handleGoogleLogin}>
          <img src="https://www.google.com/favicon.ico" width="18" alt="g" style={{ marginRight: '10px' }} />
          Continue with Google
        </button>

        <div style={s.divider}><span style={s.divText}>or</span></div>

        <div style={s.tabs}>
          <button style={mode === 'login' ? s.tabActive : s.tab} onClick={() => setMode('login')}>Login</button>
          <button style={mode === 'signup' ? s.tabActive : s.tab} onClick={() => setMode('signup')}>Sign Up</button>
        </div>

        {error && <p style={s.error}>{error}</p>}

        {mode === 'login' && (
          <div style={s.form}>
            <input style={s.input} name="email" type="email" placeholder="Email" onChange={handleChange} />
            <input style={s.input} name="password" type="password" placeholder="Password" onChange={handleChange} />
            <button style={s.submitBtn} onClick={handleLogin} disabled={loading}>
              {loading ? 'Logging in...' : 'Login →'}
            </button>
            <p style={s.switch}>No account? <span style={s.link} onClick={() => setMode('signup')}>Sign up</span></p>
          </div>
        )}

        {mode === 'signup' && (
          <div style={s.form}>
            <input style={s.input} name="name" type="text" placeholder="Full Name" onChange={handleChange} />
            <input style={s.input} name="email" type="email" placeholder="Email" onChange={handleChange} />
            <input style={s.input} name="password" type="password" placeholder="Password" onChange={handleChange} />
            <input style={s.input} name="confirm" type="password" placeholder="Confirm Password" onChange={handleChange} />
            <button style={s.submitBtn} onClick={handleSignup} disabled={loading}>
              {loading ? 'Creating...' : 'Create Account →'}
            </button>
            <p style={s.switch}>Have an account? <span style={s.link} onClick={() => setMode('login')}>Login</span></p>
          </div>
        )}

        {mode === 'home' && (
          <div style={s.form}>
            <button style={s.outlineBtn} onClick={() => setMode('login')}>Login with Email</button>
            <button style={s.outlineBtn} onClick={() => setMode('signup')}>Sign Up with Email</button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#13131a', padding: '2.5rem', borderRadius: '16px', border: '1px solid #2a2a3a', width: '100%', maxWidth: '400px' },
  logo: { color: '#fff', fontSize: '1.8rem', margin: '0 0 0.3rem', textAlign: 'center' },
  tagline: { color: '#7c3aed', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.8rem' },
  googleBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '0.85rem', background: '#fff', color: '#000', border: 'none', borderRadius: '8px', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 },
  divider: { display: 'flex', alignItems: 'center', margin: '1.2rem 0', borderTop: '1px solid #2a2a3a', position: 'relative' },
  divText: { background: '#13131a', padding: '0 0.8rem', color: '#555', fontSize: '0.85rem', position: 'absolute', left: '50%', transform: 'translateX(-50%) translateY(-50%)' },
  tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.2rem' },
  tab: { flex: 1, padding: '0.6rem', background: 'transparent', color: '#888', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' },
  tabActive: { flex: 1, padding: '0.6rem', background: '#7c3aed', color: '#fff', border: '1px solid #7c3aed', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600 },
  form: { display: 'flex', flexDirection: 'column', gap: '0.8rem' },
  input: { padding: '0.85rem', background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', outline: 'none' },
  submitBtn: { padding: '0.85rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 },
  outlineBtn: { padding: '0.85rem', background: 'transparent', color: '#fff', border: '1px solid #2a2a3a', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer' },
  switch: { color: '#888', fontSize: '0.85rem', textAlign: 'center', margin: 0 },
  link: { color: '#7c3aed', cursor: 'pointer', textDecoration: 'underline' },
  error: { color: '#ff4444', fontSize: '0.85rem', textAlign: 'center', margin: '0 0 0.5rem' }
};