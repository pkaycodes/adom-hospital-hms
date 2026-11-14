import { useState } from 'react';
import { KeyRound, Pencil, Plus, UserX } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Alert, Badge, Card, ErrorNote, Field, Loading, Modal, PageHeader } from '../components/ui';
import { dateTime } from '../format';

const EMPTY = {
  username: '',
  password: '',
  full_name: '',
  role: 'nurse',
  role_label: '',
  phone: '',
  email: '',
  is_active: true,
};

export default function Staff() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<any>('/staff');
  const meta = useApi<any>('/meta');
  const [mode, setMode] = useState<'new' | 'edit' | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [resetFor, setResetFor] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const staff = data?.staff || [];
  const roles: Record<string, string> = meta.data?.roles || {};

  function openNew() {
    setForm(EMPTY);
    setMode('new');
    setEditing(null);
    setModalError(null);
  }

  function openEdit(member: any) {
    setForm({
      full_name: member.full_name,
      role: member.role,
      role_label: member.role_label || '',
      phone: member.phone || '',
      email: member.email || '',
      is_active: !!member.is_active,
    });
    setMode('edit');
    setEditing(member);
    setModalError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (!form.full_name.trim()) {
      setModalError('Enter the staff member’s full name');
      return;
    }
    if (form.role === 'other' && !form.role_label.trim()) {
      setModalError('Enter the custom role name');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'new') {
        if (!form.username.trim()) throw new Error('Enter a username');
        if (form.password.length < 6) throw new Error('Password must be at least 6 characters');
        await api('/staff', { method: 'POST', body: form });
      } else {
        await api(`/staff/${editing.id}`, {
          method: 'PATCH',
          body: {
            full_name: form.full_name,
            role: form.role,
            role_label: form.role_label,
            phone: form.phone,
            email: form.email,
            is_active: form.is_active,
          },
        });
      }
      setMode(null);
      reload();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (password.length < 6) {
      setModalError('Password must be at least 6 characters');
      return;
    }
    setBusy(true);
    try {
      await api(`/staff/${resetFor.id}/password`, { method: 'POST', body: { password } });
      setResetFor(null);
      setPassword('');
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(member: any) {
    try {
      await api(`/staff/${member.id}`, {
        method: 'PATCH',
        body: { is_active: !member.is_active },
      });
      reload();
    } catch (err: any) {
      setModalError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Staff accounts"
        subtitle="Each staff member signs in with their own account and permissions"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Add staff
          </button>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.map((member: any) => (
                  <tr key={member.id}>
                    <td className="row-title">{member.full_name}</td>
                    <td className="mono small">{member.username}</td>
                    <td>
                      <span className="chip">
                        {member.role === 'other' ? member.role_label || 'Other staff' : roles[member.role] || member.role}
                      </span>
                    </td>
                    <td className="small muted">
                      {member.phone || '—'}
                      {member.email && <div className="row-sub">{member.email}</div>}
                    </td>
                    <td className="small muted nowrap">
                      {member.last_login_at ? dateTime(member.last_login_at) : 'Never'}
                    </td>
                    <td>
                      {member.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>}
                    </td>
                    <td className="right">
                      <div className="actions-cell">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(member)}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setResetFor(member);
                            setPassword('');
                            setModalError(null);
                          }}
                        >
                          <KeyRound size={13} /> Password
                        </button>
                        {member.id !== user?.id && (
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(member)}>
                            <UserX size={13} /> {member.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!mode}
        title={mode === 'new' ? 'Add staff account' : 'Edit staff account'}
        subtitle={mode === 'new' ? 'The staff member signs in with these credentials' : editing?.username}
        onClose={() => setMode(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="staff-form" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="staff-form" onSubmit={save} className="stack" style={{ gap: 14 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <div className="form-grid">
            <Field label="Full name" required span={2}>
              <input
                className="input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                autoFocus
              />
            </Field>
            {mode === 'new' && (
              <>
                <Field label="Username" required>
                  <input
                    className="input"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="e.g. nurse.owusu"
                  />
                </Field>
                <Field label="Temporary password" required>
                  <input
                    className="input"
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="At least 6 characters"
                  />
                </Field>
              </>
            )}
            <Field label="Role" required>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(roles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {form.role === 'other' && (
              <Field label="Role name" required>
                <input
                  className="input"
                  value={form.role_label}
                  onChange={(e) => setForm({ ...form, role_label: e.target.value })}
                  placeholder="e.g. Records Officer"
                />
              </Field>
            )}
            <Field label="Phone">
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="024 123 4567"
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            {mode === 'edit' && (
              <Field label="Account status" span={2}>
                <label className="row small">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    disabled={editing?.id === user?.id}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active — can sign in and use the system
                </label>
              </Field>
            )}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!resetFor}
        title="Reset password"
        subtitle={resetFor ? `${resetFor.full_name} · ${resetFor.username}` : ''}
        onClose={() => setResetFor(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setResetFor(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="password-form" disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </>
        }
      >
        <form id="password-form" onSubmit={changePassword} className="stack" style={{ gap: 12 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <Alert tone="warn">
            The staff member will be signed out of all devices and must use the new password.
          </Alert>
          <Field label="New password" required>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              placeholder="At least 6 characters"
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
