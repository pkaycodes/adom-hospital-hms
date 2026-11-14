import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardPlus, Plus, Search, UserPlus } from 'lucide-react';
import { api, useApi } from '../api';
import PatientFormModal from '../components/PatientForm';
import { Alert, Badge, Card, Empty, Field, Loading, Modal, PageHeader } from '../components/ui';
import { VISIT_STATUS, ageText, dateTime, timeOnly, waitedFor } from '../format';

export default function Reception() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [registering, setRegistering] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patients = useApi<any>(`/patients?q=${encodeURIComponent(query)}`);
  const doctors = useApi<any>('/staff/doctors');
  const todays = useApi<any>('/visits?today=1');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  async function checkIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError('Enter the reason for the visit');
      return;
    }
    setBusy(true);
    try {
      const detail = await api<any>('/visits', {
        method: 'POST',
        body: { patient_id: selected.id, reason: reason.trim(), doctor_id: doctorId || null },
      });
      setSelected(null);
      setReason('');
      setDoctorId('');
      navigate(`/visits/${detail.visit.id}`);
    } catch (err: any) {
      setError(err.message || 'Could not create the visit');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Reception"
        subtitle="Register patients, find existing records and send them to the nursing queue"
        actions={
          <button className="btn btn-primary" onClick={() => setRegistering(true)}>
            <UserPlus size={15} /> Register new patient
          </button>
        }
      />

      <div className="layout-main">
        <div className="stack">
          <Card
            title="Find a patient"
            subtitle="Search by name, patient ID, phone number or NHIS number"
            actions={
              <div className="search-box" style={{ maxWidth: 280 }}>
                <Search size={15} />
                <input
                  className="input"
                  placeholder="Search patients…"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </div>
            }
            flush
          >
            {patients.loading && !patients.data ? (
              <Loading />
            ) : patients.data?.patients?.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>ID</th>
                      <th>Age / gender</th>
                      <th>Phone</th>
                      <th>NHIS</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {patients.data.patients.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/patients/${p.id}`} className="row-title" style={{ color: 'var(--text)' }}>
                            {p.full_name}
                          </Link>
                          {p.conditions && <div className="row-sub">{p.conditions}</div>}
                        </td>
                        <td className="mono small">{p.patient_no}</td>
                        <td className="small muted nowrap">
                          {ageText(p.age)} · {p.gender === 'male' ? 'M' : 'F'}
                        </td>
                        <td className="small nowrap">{p.phone || '—'}</td>
                        <td>
                          {p.nhis_status === 'active' ? (
                            <Badge tone="green">Active</Badge>
                          ) : p.nhis_status === 'expired' ? (
                            <Badge tone="red">Expired</Badge>
                          ) : (
                            <span className="faint small">None</span>
                          )}
                        </td>
                        <td className="right">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setSelected(p);
                              setError(null);
                              setReason('');
                            }}
                          >
                            <ClipboardPlus size={14} /> Check in
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title={query ? 'No matching patients' : 'Search for a patient to check them in'}
                note={
                  query
                    ? 'Check the spelling, or register the patient if this is their first visit.'
                    : 'Registration creates a permanent medical record used across every visit.'
                }
                action={
                  <button className="btn btn-secondary btn-sm" onClick={() => setRegistering(true)}>
                    <Plus size={14} /> Register patient
                  </button>
                }
              />
            )}
          </Card>

          <Card
            title="Visits created today"
            subtitle="All patients checked in today"
            actions={
              <button className="btn btn-ghost btn-sm" onClick={() => todays.reload()}>
                Refresh
              </button>
            }
            flush
          >
            {todays.loading && !todays.data ? (
              <Loading />
            ) : todays.data?.visits?.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Visit</th>
                      <th>Reason</th>
                      <th>Checked in</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {todays.data.visits.map((v: any) => (
                      <tr key={v.id}>
                        <td>
                          <div className="row-title">{v.patient_name}</div>
                          <div className="row-sub">{v.patient_no}</div>
                        </td>
                        <td className="mono small">{v.visit_no}</td>
                        <td className="small" style={{ maxWidth: 220 }}>{v.reason}</td>
                        <td className="small nowrap">
                          {timeOnly(v.created_at)}
                          <div className="row-sub">{waitedFor(v.created_at)} ago</div>
                        </td>
                        <td>
                          <Badge tone={VISIT_STATUS[v.status]?.tone || 'gray'}>
                            {VISIT_STATUS[v.status]?.label || v.status}
                          </Badge>
                        </td>
                        <td className="right">
                          <Link className="btn btn-secondary btn-sm" to={`/visits/${v.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No visits today yet" note="Checked-in patients will appear here." />
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="How the visit workflow runs">
            <ol className="small muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
              <li>Reception checks the patient in and records the reason for the visit.</li>
              <li>Nurse records vitals, complaints and symptoms.</li>
              <li>Doctor reviews, diagnoses, requests tests and prescribes.</li>
              <li>Laboratory enters results; pharmacy dispenses medicines.</li>
              <li>Cashier records cash or Mobile Money payment and prints a receipt.</li>
            </ol>
          </Card>
          <Card title="Today's activity">
            <div className="detail-list">
              <div className="detail-row">
                <span>Visits created</span>
                <strong>{todays.data?.visits?.length ?? '—'}</strong>
              </div>
              <div className="detail-row">
                <span>Last update</span>
                <span className="muted small">
                  {todays.data?.visits?.[0] ? dateTime(todays.data.visits[0].created_at) : '—'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <PatientFormModal
        open={registering}
        onClose={() => setRegistering(false)}
        onSaved={(patient) => {
          patients.reload();
          if (patient?.id) {
            setSelected(patient);
            setReason('');
            setError(null);
          }
        }}
      />

      <Modal
        open={!!selected}
        title="Check in patient"
        subtitle={selected ? `${selected.full_name} · ${selected.patient_no}` : ''}
        onClose={() => setSelected(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSelected(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="checkin-form" disabled={busy}>
              {busy ? 'Creating visit…' : 'Create visit and queue for nursing'}
            </button>
          </>
        }
      >
        <form id="checkin-form" onSubmit={checkIn} className="stack" style={{ gap: 14 }}>
          {error && <Alert tone="error">{error}</Alert>}
          {selected && (
            <div className="row">
              <span className="chip">{ageText(selected.age)}</span>
              <span className="chip">{selected.gender === 'male' ? 'Male' : 'Female'}</span>
              {selected.phone && <span className="chip">{selected.phone}</span>}
              {selected.nhis_status === 'active' ? (
                <Badge tone="green">NHIS active</Badge>
              ) : (
                <Badge tone="gray">No active NHIS</Badge>
              )}
            </div>
          )}
          <Field label="Reason for visit" required>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Fever and headache for two days"
              autoFocus
            />
          </Field>
          <Field label="Assign doctor" hint="Optional — nursing assessment always comes first">
            <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Any available doctor</option>
              {doctors.data?.doctors?.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </Field>
        </form>
      </Modal>
    </>
  );
}
