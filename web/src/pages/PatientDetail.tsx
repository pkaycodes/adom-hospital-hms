import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Pencil, Plus } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import PatientFormModal from '../components/PatientForm';
import { Alert, Badge, Card, ErrorNote, Field, Loading, Modal, PageHeader } from '../components/ui';
import {
  LAB_STATUS,
  VISIT_STATUS,
  ageText,
  dateOnly,
  dateTime,
  initials,
  money,
} from '../format';

export default function PatientDetail() {
  const { id } = useParams();
  const { has } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<any>(`/patients/${id}`);
  const doctors = useApi<any>('/staff/doctors');
  const [editing, setEditing] = useState(false);
  const [newVisit, setNewVisit] = useState(false);
  const [reason, setReason] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [visitError, setVisitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const patient = data.patient;
  const visits = data.visits || [];
  const allergy =
    patient.allergies && patient.allergies.toLowerCase() !== 'none known' ? patient.allergies : null;

  async function createVisit(e: React.FormEvent) {
    e.preventDefault();
    setVisitError(null);
    if (!reason.trim()) {
      setVisitError('Enter the reason for the visit');
      return;
    }
    setBusy(true);
    try {
      const detail = await api<any>('/visits', {
        method: 'POST',
        body: { patient_id: patient.id, reason: reason.trim(), doctor_id: doctorId || null },
      });
      navigate(`/visits/${detail.visit.id}`);
    } catch (err: any) {
      setVisitError(err.message || 'Could not create the visit');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/patients" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> All patients
      </Link>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="patient-banner">
          <div className="avatar avatar-lg">{initials(patient.full_name)}</div>
          <div className="grow">
            <div className="banner-name">{patient.full_name}</div>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="chip mono">{patient.patient_no}</span>
              <span className="chip">{ageText(patient.age)}</span>
              <span className="chip">
                {patient.gender === 'male' ? 'Male' : patient.gender === 'female' ? 'Female' : 'Other'}
              </span>
              {patient.phone && <span className="chip">{patient.phone}</span>}
              {patient.nhis_status === 'active' ? (
                <Badge tone="green">NHIS active {patient.nhis_number ? `· ${patient.nhis_number}` : ''}</Badge>
              ) : patient.nhis_status === 'expired' ? (
                <Badge tone="red">NHIS expired</Badge>
              ) : (
                <Badge tone="gray">No NHIS</Badge>
              )}
              {allergy && (
                <span className="chip warn">
                  <AlertTriangle size={12} /> Allergy: {allergy}
                </span>
              )}
            </div>
          </div>
          <div className="row">
            {has('patients.manage') && (
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit record
              </button>
            )}
            {has('visits.manage') && (
              <button className="btn btn-primary" onClick={() => setNewVisit(true)}>
                <Plus size={15} /> New visit
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="layout-main">
        <div className="stack">
          <Card title="Visit history" subtitle={`${visits.length} recorded visit${visits.length === 1 ? '' : 's'}`} flush>
            {visits.length === 0 ? (
              <div className="empty">
                <h3>No visits yet</h3>
                <p>Start a visit to record vitals, consultation, treatment and payment.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Visit</th>
                      <th>Reason / diagnosis</th>
                      <th>Doctor</th>
                      <th>Status</th>
                      <th className="right">Billed</th>
                      <th className="right">Paid</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((v: any) => (
                      <tr key={v.id}>
                        <td className="small nowrap">{dateOnly(v.created_at)}</td>
                        <td className="mono small nowrap">{v.visit_no}</td>
                        <td>
                          <div className="row-title">{v.reason}</div>
                          {v.diagnosis && <div className="row-sub">Dx: {v.diagnosis}</div>}
                        </td>
                        <td className="small muted">{v.doctor_name || '—'}</td>
                        <td>
                          <Badge tone={VISIT_STATUS[v.status]?.tone || 'gray'}>
                            {VISIT_STATUS[v.status]?.label || v.status}
                          </Badge>
                        </td>
                        <td className="right mono small">{money(v.billed)}</td>
                        <td className="right mono small">{money(v.paid)}</td>
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
            )}
          </Card>

          <Card title="Medicine history" subtitle="Recent prescriptions across visits" flush>
            {data.prescriptions?.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Medication</th>
                      <th>Dosage</th>
                      <th>Prescribed</th>
                      <th>Visit</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.prescriptions.slice(0, 12).map((rx: any) => (
                      <tr key={rx.id}>
                        <td className="row-title">{rx.drug_name}</td>
                        <td className="small muted">
                          {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ')}
                        </td>
                        <td className="small nowrap">{dateOnly(rx.prescribed_at)}</td>
                        <td className="mono small">{rx.visit_no}</td>
                        <td>
                          <Badge
                            tone={
                              rx.status === 'dispensed'
                                ? 'green'
                                : rx.status === 'pending'
                                  ? 'amber'
                                  : rx.status === 'unavailable'
                                    ? 'red'
                                    : 'gray'
                            }
                          >
                            {rx.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <h3>No prescriptions recorded</h3>
              </div>
            )}
          </Card>

          <Card title="Laboratory results" subtitle="Completed investigations" flush>
            {data.lab_results?.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Result</th>
                      <th>Visit</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lab_results.map((lab: any) => (
                      <tr key={lab.id}>
                        <td className="row-title">{lab.test_name}</td>
                        <td className="small" style={{ maxWidth: 320 }}>{lab.result}</td>
                        <td className="mono small">{lab.visit_no}</td>
                        <td className="small nowrap muted">{dateTime(lab.resulted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <h3>No completed laboratory tests</h3>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Contact details">
            <dl className="kv">
              <dt>Phone</dt>
              <dd>{patient.phone || '—'}</dd>
              <dt>Address</dt>
              <dd>{patient.address || '—'}</dd>
              <dt>Emergency</dt>
              <dd>
                {patient.emergency_name || '—'}
                {patient.emergency_phone ? ` · ${patient.emergency_phone}` : ''}
              </dd>
              <dt>Ghana Card</dt>
              <dd>{patient.ghana_card || '—'}</dd>
              <dt>NHIS number</dt>
              <dd>{patient.nhis_number || '—'}</dd>
              <dt>Registered</dt>
              <dd>{dateOnly(patient.created_at)}</dd>
            </dl>
          </Card>

          <Card title="Medical information">
            <div className="stack-sm">
              <div>
                <div className="faint tiny">Allergies</div>
                <div className={allergy ? 'row-title' : 'muted small'}>{allergy || 'None recorded'}</div>
              </div>
              <div>
                <div className="faint tiny">Existing conditions</div>
                <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                  {patient.conditions || 'None recorded'}
                </div>
              </div>
              <div>
                <div className="faint tiny">Notes</div>
                <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                  {patient.notes || '—'}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <PatientFormModal
        open={editing}
        patient={patient}
        onClose={() => setEditing(false)}
        onSaved={() => reload()}
      />

      <Modal
        open={newVisit}
        title="Start a new visit"
        subtitle={`${patient.full_name} · ${patient.patient_no}`}
        onClose={() => setNewVisit(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setNewVisit(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" form="visit-form" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create visit'}
            </button>
          </>
        }
      >
        <form id="visit-form" onSubmit={createVisit} className="stack" style={{ gap: 14 }}>
          {visitError && <Alert tone="error">{visitError}</Alert>}
          <Field label="Reason for visit" required>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Fever and headache for two days"
            />
          </Field>
          <Field label="Assign doctor" hint="Optional — the patient still goes to nursing first">
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
