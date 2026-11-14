import { useEffect, useState } from 'react';
import { Database, Save } from 'lucide-react';
import { api, useApi } from '../api';
import { Alert, Card, ErrorNote, Field, Loading, PageHeader } from '../components/ui';
import { dateTime } from '../format';

const ROLE_NOTES: [string, string][] = [
  ['Administrator', 'Full access: staff accounts, service prices, hospital settings, finance and audit logs.'],
  ['Doctor', 'Patient records, visits, consultations, diagnoses, laboratory requests and prescriptions.'],
  ['Nurse', 'Patient records, visit queues, vital signs and presenting complaints.'],
  ['Cashier', 'Invoices, cash and Mobile Money payments, receipts and financial reports.'],
  ['Pharmacist', 'Prescription queue, dispensing, medicine stock and inventory.'],
  ['Laboratory Technician', 'Laboratory request queue and result entry.'],
  ['Receptionist', 'Patient registration, check-in, visit queues and bill viewing.'],
  ['Other staff', 'Custom role name with reception-level patient and visit access.'],
];

export default function Settings() {
  const { data, loading, error, reload } = useApi<any>('/settings');
  const [form, setForm] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.settings && !form) setForm({ ...data.settings });
  }, [data, form]);

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    setSaveError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveError('Choose an image file for the logo');
      return;
    }
    if (file.size > 300 * 1024) {
      setSaveError('The logo image must be 300 KB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f: any) => ({ ...f, logo_url: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setNotice(null);
    if (!form.name?.trim()) {
      setSaveError('The hospital name is required');
      return;
    }
    setBusy(true);
    try {
      const res = await api<any>('/settings', { method: 'PATCH', body: form });
      setForm({ ...res.settings });
      setNotice('Hospital information updated. It now appears on all printed documents.');
      reload();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Hospital settings"
        subtitle="These details are used on bills, receipts and consultation summaries"
      />

      {notice && <div style={{ marginBottom: 14 }}><Alert tone="success">{notice}</Alert></div>}
      {saveError && <div style={{ marginBottom: 14 }}><Alert tone="error">{saveError}</Alert></div>}

      <div className="layout-main">
        <div className="stack">
          {form && (
            <Card title="Hospital information" subtitle="Editable by administrators">
              <form onSubmit={save} className="stack" style={{ gap: 14 }}>
                <div className="form-grid">
                  <Field label="Hospital / clinic name" required span={2}>
                    <input
                      className="input"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Logo initials" hint="Shown when no logo image is uploaded">
                    <input
                      className="input"
                      value={form.logo_text || ''}
                      maxLength={3}
                      onChange={(e) => setForm({ ...form, logo_text: e.target.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label="Logo image" hint="PNG, JPEG, WebP or GIF · maximum 300 KB">
                    <input type="file" accept="image/*" className="input" onChange={onLogoFile} />
                  </Field>
                  {form.logo_url && (
                    <div className="row" style={{ gap: 12 }}>
                      <img
                        src={form.logo_url}
                        alt="Hospital logo preview"
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setForm({ ...form, logo_url: null })}
                      >
                        Remove logo
                      </button>
                    </div>
                  )}
                  <Field label="Telephone">
                    <input
                      className="input"
                      value={form.phone || ''}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Physical address" span={2}>
                    <input
                      className="input"
                      value={form.address || ''}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className="input"
                      value={form.email || ''}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Mobile Money number" hint="Shown on bills and receipts">
                    <input
                      className="input"
                      value={form.momo_number || ''}
                      onChange={(e) => setForm({ ...form, momo_number: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit" disabled={busy}>
                    <Save size={14} /> {busy ? 'Saving…' : 'Save hospital information'}
                  </button>
                </div>
                <div className="faint tiny">
                  Last updated {form.updated_at ? dateTime(form.updated_at) : '—'}
                </div>
              </form>
            </Card>
          )}

          <Card title="Roles and access" subtitle="Enforced on the server for every request" flush>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLE_NOTES.map(([role, note]) => (
                    <tr key={role}>
                      <td className="row-title nowrap">{role}</td>
                      <td className="small muted">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Data protection" subtitle="Backups and record retention">
            <div className="stack-sm">
              <p className="small muted">
                All patient, clinical and financial records are stored in one central database on the hospital
                server. Records are never permanently deleted from the application — patients are archived and
                payments can only be reversed with an audit trail.
              </p>
              <a className="btn btn-secondary btn-sm" href="/api/backup" download>
                <Database size={14} /> Download database backup
              </a>
              <div className="faint tiny">
                Download a consistent copy of the database at any time. Store backups securely and keep them
                off-site. Backups include patient medical information.
              </div>
            </div>
          </Card>

          <Card title="Currency and time">
            <div className="detail-list">
              <div className="detail-row"><span>Currency</span><strong>Ghana Cedi (GH₵)</strong></div>
              <div className="detail-row"><span>Timezone</span><strong>Africa/Accra</strong></div>
              <div className="detail-row"><span>Payment methods</span><strong>Cash, Mobile Money</strong></div>
              <div className="detail-row"><span>Patient numbering</span><strong>GH-0001 format</strong></div>
            </div>
          </Card>

          <Card title="Staff account security">
            <p className="small muted">
              Staff should change their initial password from <strong>My account</strong>. Administrators can reset
              a password at any time, which signs that staff member out everywhere.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
