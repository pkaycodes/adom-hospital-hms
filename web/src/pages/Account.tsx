import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, Card, Field, PageHeader } from '../components/ui';
import { dateTime, initials } from '../format';

export default function Account() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!current) {
      setError('Enter your current password');
      return;
    }
    if (next.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (next !== confirm) {
      setError('The new passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { current_password: current, new_password: next },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setNotice('Password changed. Use your new password the next time you sign in.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="My account" subtitle="Your sign-in details and password" />

      <div className="layout-main">
        <Card title="Change password" subtitle="Choose a password only you know">
          <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
            {error && <Alert tone="error">{error}</Alert>}
            {notice && <Alert tone="success">{notice}</Alert>}
            <Field label="Current password" required>
              <input
                className="input"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <div className="form-grid">
              <Field label="New password" required>
                <input
                  className="input"
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm new password" required>
                <input
                  className="input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                <KeyRound size={14} /> {busy ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </Card>

        <Card title="Profile">
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="avatar avatar-lg">{initials(user?.full_name)}</div>
            <div>
              <div className="row-title" style={{ fontSize: 16 }}>{user?.full_name}</div>
              <div className="muted small">{user?.role_label}</div>
            </div>
          </div>
          <dl className="kv">
            <dt>Username</dt>
            <dd className="mono">{user?.username}</dd>
            <dt>Phone</dt>
            <dd>{user?.phone || '—'}</dd>
            <dt>Email</dt>
            <dd>{user?.email || '—'}</dd>
            <dt>Last sign-in</dt>
            <dd>{user?.last_login_at ? dateTime(user.last_login_at) : '—'}</dd>
          </dl>
          <div className="faint tiny" style={{ marginTop: 14 }}>
            Access is limited to the permissions assigned to your role. Contact an administrator for changes.
          </div>
        </Card>
      </div>
    </>
  );
}
