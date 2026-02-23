import { useState, useEffect } from 'react';
import axios from 'axios';

const niches = ['social media', 'tech', 'finance', 'fitness', 'startup', 'AI'];

export default function Trends() {
  const [trends, setTrends] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [niche, setNiche] = useState('social media');
  const [loading, setLoading] = useState(false);

  const fetchTrends = async () => {
    setLoading(true);
    setTrends([]);
    setIdeas([]);
    try {
      const { data } = await axios.get(`http://localhost:5000/api/trends?niche=${niche}`);
      setTrends(data.trending || []);
      setIdeas(data.ideas || []);
    } catch {
      alert('Error fetching trends');
    }
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
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.title}>📈 Trend Intelligence</h2>
        <p style={s.sub}>Real-time trending topics + AI-generated content ideas</p>

        <div style={s.nicheRow}>
          {niches.map(n => (
            <button key={n} style={niche === n ? s.nicheActive : s.nicheBtn}
              onClick={() => setNiche(n)}>{n}</button>
          ))}
        </div>

        <button style={s.fetchBtn} onClick={fetchTrends} disabled={loading}>
          {loading ? '⏳ Fetching...' : '🔄 Refresh Trends'}
        </button>
      </div>

      {loading && (
        <div style={s.loadingBox}>
          <p style={s.loadingText}>🧠 Scanning trends + generating ideas...</p>
        </div>
      )}

      {!loading && trends.length > 0 && (
        <div style={s.grid}>
          {/* Trending Topics */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>🔥 Trending Now (India)</h3>
            <div style={s.trendList}>
              {trends.map((t, i) => (
                <div key={i} style={s.trendItem}>
                  <span style={s.trendRank}>#{i + 1}</span>
                  <div>
                    <p style={s.trendName}>{t.title}</p>
                    <p style={s.trendTraffic}>{t.traffic} searches</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Content Ideas */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>💡 AI Content Ideas for <span style={{ color: '#7c3aed' }}>{niche}</span></h3>
            <div style={s.ideaList}>
              {ideas.map((idea, i) => (
                <div key={i} style={s.ideaCard}>
                  <div style={s.ideaTop}>
                    <span style={s.ideaTopic}>📌 {idea.topic}</span>
                    <span style={{ ...s.platformBadge, background: platformColor(idea.platform) }}>
                      {idea.platform}
                    </span>
                  </div>
                  <p style={s.ideaHook}>🎣 Hook: <em>{idea.hook}</em></p>
                  <p style={s.ideaAngle}>💡 Angle: {idea.angle}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { flex: 1, padding: '1.5rem', overflowY: 'auto', color: '#fff' },
  header: { marginBottom: '1.5rem' },
  title: { margin: '0 0 0.3rem', fontSize: '1.4rem' },
  sub: { color: '#888', margin: '0 0 1rem', fontSize: '0.9rem' },
  nicheRow: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' },
  nicheBtn: { padding: '0.4rem 1rem', background: 'transparent', color: '#888', border: '1px solid #2a2a3a', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem' },
  nicheActive: { padding: '0.4rem 1rem', background: '#7c3aed', color: '#fff', border: '1px solid #7c3aed', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  fetchBtn: { padding: '0.6rem 1.5rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 },
  loadingBox: { textAlign: 'center', padding: '3rem' },
  loadingText: { color: '#7c3aed', fontSize: '1rem' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' },
  card: { background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '16px', padding: '1.5rem' },
  cardTitle: { margin: '0 0 1rem', fontSize: '1rem', color: '#fff' },
  trendList: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  trendItem: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem', background: '#1e1e2e', borderRadius: '8px' },
  trendRank: { color: '#7c3aed', fontWeight: 700, fontSize: '0.85rem', minWidth: '24px' },
  trendName: { margin: 0, fontSize: '0.9rem', color: '#fff' },
  trendTraffic: { margin: 0, fontSize: '0.75rem', color: '#888' },
  ideaList: { display: 'flex', flexDirection: 'column', gap: '0.8rem' },
  ideaCard: { padding: '0.8rem', background: '#1e1e2e', borderRadius: '10px', border: '1px solid #2a2a3a' },
  ideaTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  ideaTopic: { fontSize: '0.85rem', fontWeight: 600, color: '#fff' },
  platformBadge: { padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', color: '#fff', fontWeight: 600 },
  ideaHook: { margin: '0 0 0.3rem', fontSize: '0.82rem', color: '#aaa' },
  ideaAngle: { margin: 0, fontSize: '0.82rem', color: '#888' }
};