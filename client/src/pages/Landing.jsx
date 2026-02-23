import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <h1 style={styles.title}>🧠 SynapSocial</h1>
        <p style={styles.subtitle}>Your Autonomous AI Social Media Agent</p>
        <p style={styles.desc}>Connect all your platforms. Let AI do the work.</p>
        <button style={styles.btn} onClick={() => navigate('/login')}>
          Get Started Free →
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  hero: { textAlign: 'center', padding: '2rem' },
  title: { fontSize: '4rem', color: '#fff', margin: 0 },
  subtitle: { fontSize: '1.5rem', color: '#7c3aed', marginTop: '1rem' },
  desc: { fontSize: '1.1rem', color: '#888', marginTop: '1rem' },
  btn: { marginTop: '2rem', padding: '1rem 2.5rem', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.1rem', cursor: 'pointer' }
};