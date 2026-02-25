import { useState, useEffect } from 'react';
import axios from 'axios';
const API_URL = process.env.REACT_APP_API_URL || 'https://synapsocial-api.onrender.com';

const niches = ['social media', 'tech', 'finance', 'fitness', 'startup', 'AI'];

export default function Trends() {
  const [trends, setTrends] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [niche, setNiche] = useState('social media');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const r = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const fetchTrends = async () => {
    setLoading(true); setTrends([]); setIdeas([]);
    try {
      const { data } = await axios.get(`${API_URL}/api/trends?niche=${niche}`);
      setTrends(data.trending || []); setIdeas(data.ideas || []);
    } catch { alert('Error fetching trends'); }
    setLoading(false);
  };

  useEffect(() => { fetchTrends(); }, [niche]);

  const platformColor = (p) => {
    if (p === 'LinkedIn') return '#0077b5';
    if (p === 'Instagram') return '#e1306c';
    if (p === 'YouTube') return '#ff0000';
    return '#7c3aed';
  };

  return (
    <div style={{ flex: 1, padding: isMobile ? '1rem' : '1.5rem', overflowY: 'auto', color: '#fff' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.3rem', fontSize: isMobile ? '1.2rem' : '1.4rem' }}>📈 Trend Intelligence</h2>
        <p style={{ color: '#888', margin: '0 0 1rem', fontSize: '0.9rem' }}>Real-time trending topics + AI-generated content ideas</p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {niches.map(n => (
            <button key={n} style={{ padding: '0.4rem 0.8rem', background: niche === n ? '#7c3aed' : 'transparent', color: niche === n ? '#fff' : '#888', border: '1px solid #2a2a3a', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: niche === n ? 600 : 400 }}
              onClick={() => setNiche(n)}>{n}</button>
          ))}
        </div>
        <button style={{ padding: '0.6rem 1.5rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
          onClick={fetchTrends} disabled={loading}>{loading ? '⏳ Fetching...' : '🔄 Refresh Trends'}</button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#7c3aed', fontSize: '1rem' }}>🧠 Scanning trends + generating ideas...</p>
        </div>
      )}

      {!loading && trends.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
          <div style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#fff' }}>🔥 Trending Now (India)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {trends.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem', background: '#1e1e2e', borderRadius: '8px' }}>
                  <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: '0.85rem', minWidth: '24px' }}>#{i + 1}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>{t.title}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#888' }}>{t.traffic} searches</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#fff' }}>💡 AI Content Ideas for <span style={{ color: '#7c3aed' }}>{niche}</span></h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {ideas.map((idea, i) => (
                <div key={i} style={{ padding: '0.8rem', background: '#1e1e2e', borderRadius: '10px', border: '1px solid #2a2a3a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>📌 {idea.topic}</span>
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', color: '#fff', fontWeight: 600, background: platformColor(idea.platform) }}>{idea.platform}</span>
                  </div>
                  <p style={{ margin: '0 0 0.3rem', fontSize: '0.82rem', color: '#aaa' }}>🎣 Hook: <em>{idea.hook}</em></p>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#888' }}>💡 Angle: {idea.angle}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}