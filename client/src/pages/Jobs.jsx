import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Jobs() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => { scanJobs(); }, []);

  const scanJobs = async () => {
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const res = await axios.get(`http://localhost:5000/api/jobs/scan/${user.id}`);
      setData(res.data);
    } catch (err) {
      const msg = err.response?.data?.message;
      if (msg === 'AUTO_APPLY_OFF') {
        setError({ type: 'toggle', text: err.response.data.hint });
      } else if (msg === 'NO_RESUME') {
        setError({ type: 'resume', text: err.response.data.hint });
      } else {
        setError({ type: 'generic', text: 'Job scan failed. Try again.' });
      }
    }
    setLoading(false);
  };

  const goToPlatforms = () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'platforms' }));
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>💼 AI Job Scanner</h2>
          <p style={s.sub}>
            {data?.resumeFound
              ? '✅ Scanning based on your uploaded resume'
              : loading
              ? '🧠 Analyzing resume + scanning job market...'
              : 'Find jobs matched to your resume using AI'}
          </p>
        </div>
        <button style={s.refreshBtn} onClick={scanJobs} disabled={loading}>
          {loading ? '⏳ Scanning...' : '🔄 Re-scan'}
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={s.loadingBox}>
          <p style={s.loadingIcon}>🧠</p>
          <p style={s.loadingText}>Reading your resume + scanning job market...</p>
          <p style={s.loadingSub}>This takes a few seconds...</p>
        </div>
      )}

      {/* Error States */}
      {error && !loading && (
        <div style={s.errorBox}>
          <p style={s.errorIcon}>
            {error.type === 'toggle' ? '🔴' : error.type === 'resume' ? '📄' : '❌'}
          </p>
          <p style={s.errorText}>{error.text}</p>
          {(error.type === 'toggle' || error.type === 'resume') && (
            <button style={s.errorBtn} onClick={goToPlatforms}>
              → Go to Platforms
            </button>
          )}
          {error.type === 'generic' && (
            <button style={s.errorBtn} onClick={scanJobs}>
              🔄 Try Again
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Skills + Job Titles */}
          <div style={s.infoRow}>
            <div style={s.infoCard}>
              <h4 style={s.infoTitle}>🎯 Detected Skills</h4>
              <div style={s.tagRow}>
                {data.skills?.map((skill, i) => (
                  <span key={i} style={s.skillTag}>{skill}</span>
                ))}
              </div>
            </div>
            <div style={s.infoCard}>
              <h4 style={s.infoTitle}>🔍 Searching For</h4>
              <div style={s.tagRow}>
                {data.jobTitles?.map((title, i) => (
                  <span key={i} style={s.jobTitleTag}>{title}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Job Listings */}
          <h3 style={s.jobsTitle}>📋 Matching Jobs ({data.jobs?.length || 0} found)</h3>
          <div style={s.jobGrid}>
            {data.jobs?.map((job, i) => (
              <div key={i} style={s.jobCard}>
                <div style={s.jobTop}>
                  <div style={{ flex: 1 }}>
                    <h4 style={s.jobTitle}>{job.title}</h4>
                    <p style={s.jobCompany}>🏢 {job.company}</p>
                  </div>
                  <span style={s.postedBadge}>{job.posted}</span>
                </div>
                <p style={s.jobLocation}>📍 {job.location}</p>
                <p style={s.jobDesc}>{job.description}</p>
                <div style={s.jobFooter}>
                  <span style={s.viaBadge}>via {job.via}</span>
                  <a href={job.applyLink} target="_blank" rel="noreferrer" style={s.applyBtn}>
                    Apply Now →
                  </a>
                </div>
              </div>
            ))}
          </div>

          {data.jobs?.length === 0 && (
            <div style={s.noJobs}>
              <p style={{ fontSize: '2rem' }}>🔍</p>
              <p>No jobs found. Try updating your resume with more skills.</p>
              <button style={s.errorBtn} onClick={scanJobs}>🔄 Try Again</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  container: { flex: 1, padding: '1.5rem', overflowY: 'auto', color: '#fff' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  title: { margin: '0 0 0.3rem', fontSize: '1.4rem' },
  sub: { color: '#888', fontSize: '0.85rem', margin: 0 },
  refreshBtn: { padding: '0.6rem 1.2rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  loadingBox: { textAlign: 'center', padding: '4rem', background: '#13131a', borderRadius: '16px', border: '1px solid #2a2a3a' },
  loadingIcon: { fontSize: '3rem', margin: '0 0 1rem' },
  loadingText: { color: '#7c3aed', fontSize: '1.1rem', margin: '0 0 0.5rem' },
  loadingSub: { color: '#555', fontSize: '0.85rem', margin: 0 },
  errorBox: { textAlign: 'center', padding: '4rem', background: '#13131a', borderRadius: '16px', border: '1px solid #2a2a3a' },
  errorIcon: { fontSize: '3rem', margin: '0 0 1rem' },
  errorText: { color: '#aaa', fontSize: '1rem', margin: '0 0 1.5rem', lineHeight: 1.6 },
  errorBtn: { padding: '0.7rem 1.5rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' },
  infoRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },
  infoCard: { background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '12px', padding: '1rem' },
  infoTitle: { margin: '0 0 0.8rem', fontSize: '0.9rem', color: '#7c3aed' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  skillTag: { padding: '0.3rem 0.7rem', background: '#7c3aed22', border: '1px solid #7c3aed44', borderRadius: '20px', fontSize: '0.78rem', color: '#c4b5fd' },
  jobTitleTag: { padding: '0.3rem 0.7rem', background: '#0077b522', border: '1px solid #0077b544', borderRadius: '20px', fontSize: '0.78rem', color: '#60a5fa' },
  jobsTitle: { margin: '0 0 1rem', fontSize: '1rem', color: '#fff' },
  jobGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' },
  jobCard: { background: '#13131a', border: '1px solid #2a2a3a', borderRadius: '14px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', transition: 'border-color 0.2s' },
  jobTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' },
  jobTitle: { margin: '0 0 0.2rem', fontSize: '0.95rem', color: '#fff' },
  jobCompany: { margin: 0, fontSize: '0.82rem', color: '#888' },
  postedBadge: { fontSize: '0.7rem', color: '#00ff88', background: '#00ff8811', padding: '0.2rem 0.5rem', borderRadius: '10px', whiteSpace: 'nowrap', flexShrink: 0 },
  jobLocation: { margin: 0, fontSize: '0.8rem', color: '#888' },
  jobDesc: { margin: 0, fontSize: '0.82rem', color: '#aaa', lineHeight: 1.5, flex: 1 },
  jobFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' },
  viaBadge: { fontSize: '0.72rem', color: '#555' },
  applyBtn: { padding: '0.5rem 1rem', background: '#0077b5', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 },
  noJobs: { textAlign: 'center', padding: '3rem', color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }
};