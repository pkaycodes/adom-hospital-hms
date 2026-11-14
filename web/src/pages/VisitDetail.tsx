import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, FileText, Printer, ReceiptText, Stethoscope } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import VitalsForm from '../components/VitalsForm';
import { Badge, Card, ErrorNote, Loading, PageHeader } from '../components/ui';
import {
  INVOICE_STATUS,
  LAB_STATUS,
  RX_STATUS,
  VISIT_STATUS,
  ageText,
  dateTime,
  money,
  timeOnly,
} from '../format';

function Vital({ label, value, unit }: { label: string; value: any; unit?: string }) {
  return (
    <div>
      <div className="faint tiny">{label}</div>
      <div className="mono" style={{ fontWeight: 650, fontSize: 14 }}>
        {value === null || value === undefined || value === '' ? '—' : value}
        {value !== null && value !== undefined && value !== '' && unit ? (
          <span className="faint tiny"> {unit}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function VisitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { has } = useAuth();
  const { data, loading, error, reload } = useApi<any>(`/visits/${id}`);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const { visit, patient, vitals, consultation, labs, prescriptions, invoice, history } = data;
  const status = VISIT_STATUS[visit.status] || { label: visit.status, tone: 'gray' as const };
  const allergy =
    patient.allergies && patient.allergies.toLowerCase() !== 'none known' ? patient.allergies : null;
  const closed = ['completed', 'cancelled'].includes(visit.status);

  async function openConsultation() {
    setActionError(null);
    if (visit.status === 'awaiting_doctor') {
      setStarting(true);
      try {
        await api(`/visits/${visit.id}/start-consultation`, { method: 'POST' });
      } catch (err: any) {
        setActionError(err.message);
        setStarting(false);
        return;
      }
      setStarting(false);
    }
    navigate(`/consultation/${visit.id}`);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 12 }}
        onClick={() => navigate(-1)}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <PageHeader
        title={`Visit ${visit.visit_no}`}
        subtitle={`${visit.reason} · checked in ${dateTime(visit.created_at)}`}
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {consultation?.completed && (
              <Link className="btn btn-secondary" to={`/print/consultation/${visit.id}`} target="_blank">
                <Printer size={14} /> Print summary
              </Link>
            )}
            {has('consultation.manage') && !closed && (
              <button className="btn btn-primary" onClick={openConsultation} disabled={starting}>
                <Stethoscope size={15} /> {starting ? 'Opening…' : visit.status === 'consulting' ? 'Continue consultation' : 'Open consultation'}
              </button>
            )}
            {has('billing.view') && invoice && (
              <Link className="btn btn-secondary" to={`/billing/${invoice.id}`}>
                <ReceiptText size={14} /> Bill
              </Link>
            )}
          </>
        }
      />

      {actionError && (
        <div style={{ marginBottom: 14 }}>
          <ErrorNote message={actionError} />
        </div>
      )}

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="patient-banner">
          <div className="avatar avatar-lg">
            {patient.full_name
              .split(' ')
              .slice(0, 2)
              .map((p: string) => p[0])
              .join('')}
          </div>
          <div className="grow">
            <Link to={`/patients/${patient.id}`} className="banner-name" style={{ color: 'var(--text)' }}>
              {patient.full_name}
            </Link>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="chip mono">{patient.patient_no}</span>
              <span className="chip">{ageText(patient.age, patient.date_of_birth)}</span>
              <span className="chip">{patient.gender === 'male' ? 'Male' : patient.gender === 'female' ? 'Female' : 'Other'}</span>
              {patient.phone && <span className="chip">{patient.phone}</span>}
              <span className="chip">{visit.visit_no}</span>
            </div>
            {allergy && (
              <div style={{ marginTop: 10 }}>
                <span className="chip warn">
                  <AlertTriangle size={12} /> Allergy: {allergy}
                </span>
              </div>
            )}
          </div>
          <div className="detail-list" style={{ minWidth: 220 }}>
            <div className="detail-row"><span>Doctor</span><strong>{visit.doctor_name || 'Not assigned'}</strong></div>
            <div className="detail-row"><span>Nurse</span><span>{visit.nurse_name || '—'}</span></div>
            <div className="detail-row"><span>Checked in</span><span>{timeOnly(visit.created_at)}</span></div>
            <div className="detail-row"><span>Closed</span><span>{visit.closed_at ? dateTime(visit.closed_at) : '—'}</span></div>
          </div>
        </div>
      </div>

      <div className="layout-main">
        <div className="stack">
          <Card
            title="Vital signs"
            subtitle={vitals ? `Recorded by ${vitals.recorded_by_name || 'nursing'} at ${dateTime(vitals.recorded_at)}` : 'Nursing assessment'}
          >
            {has('vitals.manage') && !closed ? (
              <VitalsForm
                visitId={visit.id}
                initial={vitals || undefined}
                onSaved={() => reload()}
              />
            ) : vitals ? (
              <div className="stack" style={{ gap: 14 }}>
                <div className="grid-3">
                  <Vital label="Blood pressure" value={vitals.bp_systolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic}` : '—'} unit="mmHg" />
                  <Vital label="Temperature" value={vitals.temperature} unit="°C" />
                  <Vital label="Pulse" value={vitals.pulse} unit="bpm" />
                  <Vital label="Respiratory rate" value={vitals.resp_rate} unit="/min" />
                  <Vital label="SpO₂" value={vitals.spo2} unit="%" />
                  <Vital label="Blood glucose" value={vitals.glucose} unit="mmol/L" />
                  <Vital label="Weight" value={vitals.weight} unit="kg" />
                  <Vital label="Height" value={vitals.height} unit="m" />
                </div>
                <div>
                  <div className="faint tiny">Presenting complaints</div>
                  <div className="note-box">{vitals.complaints}</div>
                </div>
              </div>
            ) : (
              <div className="alert alert-warn">
                <AlertTriangle size={15} />
                <div>Vital signs have not been recorded yet. A nurse must complete the assessment before consultation.</div>
              </div>
            )}
          </Card>

          <Card
            title="Consultation"
            subtitle={consultation?.completed ? `Completed by ${consultation.doctor_name}` : 'Clinical notes, diagnosis and plan'}
            actions={
              has('consultation.manage') && !closed ? (
                <Link className="btn btn-secondary btn-sm" to={`/consultation/${visit.id}`}>
                  Open notes
                </Link>
              ) : undefined
            }
          >
            {consultation ? (
              <div className="stack" style={{ gap: 12 }}>
                {consultation.completed && (
                  <div className="row">
                    <Badge tone="green">Consultation completed</Badge>
                    <span className="faint small">{dateTime(consultation.completed_at)}</span>
                  </div>
                )}
                {!consultation.completed && <Badge tone="amber">Draft — not yet completed</Badge>}
                <div>
                  <div className="faint tiny">Diagnosis</div>
                  <div className="row-title">{consultation.diagnosis || 'Not recorded'}</div>
                </div>
                <div className="grid-2">
                  <div>
                    <div className="faint tiny">Symptoms</div>
                    <div className="note-box">{consultation.symptoms || '—'}</div>
                  </div>
                  <div>
                    <div className="faint tiny">Clinical notes / examination</div>
                    <div className="note-box">{consultation.clinical_notes || '—'}</div>
                  </div>
                </div>
                {consultation.treatment_plan && (
                  <div>
                    <div className="faint tiny">Treatment plan</div>
                    <div className="note-box">{consultation.treatment_plan}</div>
                  </div>
                )}
                {consultation.follow_up_instructions && (
                  <div>
                    <div className="faint tiny">Follow-up instructions</div>
                    <div className="note-box">{consultation.follow_up_instructions}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon"><FileText size={19} /></div>
                <h3>Consultation not started</h3>
                <p>The doctor will record symptoms, diagnosis, tests and prescriptions here.</p>
              </div>
            )}
          </Card>

          <div className="grid-2">
            <Card title="Laboratory" subtitle={`${labs.length} request${labs.length === 1 ? '' : 's'}`} flush>
              {labs.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Test</th>
                        <th>Status</th>
                        <th className="right">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labs.map((lab: any) => (
                        <tr key={lab.id}>
                          <td>
                            <div className="row-title">{lab.test_name}</div>
                            <div className="row-sub">by {lab.requested_by_name || 'doctor'}</div>
                          </td>
                          <td>
                            <Badge tone={LAB_STATUS[lab.status]?.tone || 'gray'}>
                              {LAB_STATUS[lab.status]?.label || lab.status}
                            </Badge>
                          </td>
                          <td className="right small" style={{ maxWidth: 200 }}>
                            {lab.result ? lab.result : <span className="faint">Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty"><h3>No laboratory requests</h3></div>
              )}
            </Card>

            <Card title="Pharmacy" subtitle={`${prescriptions.length} prescription${prescriptions.length === 1 ? '' : 's'}`} flush>
              {prescriptions.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Medication</th>
                        <th>Directions</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prescriptions.map((rx: any) => (
                        <tr key={rx.id}>
                          <td>
                            <div className="row-title">{rx.drug_name} × {rx.quantity}</div>
                            <div className="row-sub">{rx.dosage}</div>
                          </td>
                          <td className="small muted">
                            {[rx.frequency, rx.duration].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td>
                            <Badge tone={RX_STATUS[rx.status]?.tone || 'gray'}>
                              {RX_STATUS[rx.status]?.label || rx.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty"><h3>No prescriptions</h3></div>
              )}
            </Card>
          </div>
        </div>

        <div className="stack">
          {has('billing.view') && invoice && (
            <Card
              title="Bill"
              subtitle={invoice.invoice_no}
              actions={
                <Badge tone={INVOICE_STATUS[invoice.status]?.tone || 'gray'}>
                  {INVOICE_STATUS[invoice.status]?.label || invoice.status}
                </Badge>
              }
              footer={
                <>
                  <span className="muted small">Balance</span>
                  <strong style={{ fontSize: 16 }}>{money(invoice.balance)}</strong>
                </>
              }
            >
              <div className="stack-sm">
                {invoice.items.filter((i: any) => i.status === 'active').length ? (
                  invoice.items
                    .filter((i: any) => i.status === 'active')
                    .map((item: any) => (
                      <div className="detail-row" key={item.id}>
                        <span>
                          {item.description}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                        </span>
                        <span className="mono">{money(item.amount)}</span>
                      </div>
                    ))
                ) : (
                  <div className="muted small">No charges yet.</div>
                )}
                <div className="total-line" style={{ marginTop: 6 }}>
                  <span className="muted">Total billed</span>
                  <strong>{money(invoice.total)}</strong>
                </div>
                <div className="total-line">
                  <span className="muted">Payments received</span>
                  <span>{money(invoice.paid)}</span>
                </div>
                <Link className="btn btn-secondary btn-sm" to={`/billing/${invoice.id}`} style={{ marginTop: 6 }}>
                  <ReceiptText size={14} /> Open bill & payments
                </Link>
              </div>
            </Card>
          )}

          <Card title="Medical information">
            <div className="stack-sm">
              <div>
                <div className="faint tiny">Allergies</div>
                <div className={allergy ? 'row-title' : 'small muted'}>{allergy || 'None recorded'}</div>
              </div>
              <div>
                <div className="faint tiny">Existing conditions</div>
                <div className="small">{patient.conditions || 'None recorded'}</div>
              </div>
              <div>
                <div className="faint tiny">NHIS</div>
                <div className="small">
                  {patient.nhis_number || 'No NHIS number'} ({patient.nhis_status})
                </div>
              </div>
            </div>
          </Card>

          <Card title="Previous diagnoses" subtitle="Earlier visits at this hospital">
            {history?.diagnoses?.length ? (
              <div className="detail-list">
                {history.diagnoses.map((d: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                    <div className="row-title" style={{ fontSize: 12.5 }}>{d.diagnosis}</div>
                    <div className="row-sub">
                      {d.visit_no} · {dateTime(d.completed_at || d.created_at)}
                    </div>
                    <Link className="tiny" to="/patients">Patient record</Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted small">No previous diagnoses recorded.</div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
