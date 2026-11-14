import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, HeartPulse, LockKeyhole, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';

const DEMO = [
  ['Administrator', 'admin', 'Admin@123'],
  ['Doctor', 'dr.mensah', 'Doctor@123'],
  ['Nurse', 'nurse.adu', 'Nurse@123'],
  ['Receptionist', 'reception', 'Reception@123'],
  ['Cashier', 'cashier.owusu', 'Cashier@123'],
  ['Pharmacist', 'pharm.boateng', 'Pharma@123'],
  ['Lab technician', 'lab.asante', 'Lab@123'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-brand">
        <div>
          <div className="brand-logo">AM</div>
          <h1>Everything your hospital does, in one place.</h1>
          <p>
            Registration, vitals, consultations, laboratory, pharmacy, billing and cash or Mobile Money
            payments — connected through one patient record.
          </p>
          <div className="login-features">
            <div className="login-feature">
              <HeartPulse size={16} /> Complete patient history across every visit
            </div>
            <div className="login-feature">
              <Activity size={16} /> Live queues from reception to dispensing
            </div>
            <div className="login-feature">
              <ShieldCheck size={16} /> Role-based access and an audit trail
            </div>
          </div>
        </div>
        <div className="login-foot">
          Built for Ghanaian clinics · Ghana Cedis (GH₵) · NHIS ready · Africa/Accra time
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h2>Staff sign in</h2>
          <p>Use the account issued by your hospital administrator.</p>
          {error && (
            <div style={{ marginBottom: 14 }}>
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <form onSubmit={onSubmit} className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <div style={{ position: 'relative' }}>
                <UserRound
                  size={15}
                  style={{ position: 'absolute', left: 11, top: 12, color: 'var(--faint)' }}
                />
                <input
                  id="username"
                  className="input"
                  style={{ paddingLeft: 33 }}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. dr.mensah"
                  autoFocus
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <LockKeyhole
                  size={15}
                  style={{ position: 'absolute', left: 11, top: 12, color: 'var(--faint)' }}
                />
                <input
                  id="password"
                  type="password"
                  className="input"
                  style={{ paddingLeft: 33 }}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="demo-box">
            <strong>Demo accounts</strong>
            <div className="demo-grid" style={{ marginTop: 5 }}>
              {DEMO.map(([label, user, pass]) => (
                <div key={user}>
                  {label}: <code>{user}</code> / <code>{pass}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
