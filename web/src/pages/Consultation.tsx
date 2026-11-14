import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, FlaskConical, Pill, Plus, Printer, Trash2 } from 'lucide-react';
import { api, useApi } from '../api';
import { Alert, Badge, Card, ErrorNote, Field, Loading, PageHeader } from '../components/ui';
import {
  LAB_STATUS,
  RX_STATUS,
  VISIT_STATUS,
  ageText,
  dateTime,
  money,
} from '../format';

const EMPTY_FORM = {
  symptoms: '',
  clinical_notes: '',
  diagnosis: '',
  treatment_plan: '',
  follow_up_instructions: '',
  consultation_service_id: '',
};

export default function Consultation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<any>(`/visits/${id}`);
  const services = useApi<any>('/services');
  const inventory = useApi<any>('/pharmacy/inventory/list');

  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [initialised, setInitialised] = useState(false);
  const [selectedTests, setSelectedTests] = useState<number[]>([]);
  const [rx, setRx] = useState<any>({
    medication_id: '',
    drug_name: '',
    dosage: '',
    frequency: '',
    duration: '',
    quantity: 1,
    instructions: '',
  });
  const [extraService, setExtraService] = useState({ service_id: '', quantity: 1 });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!data || initialised) return;
    const c = data.consultation;
    const consultService = (services.data?.services || []).find((s: any) => s.category === 'Consultation');
    setForm({
      symptoms: c?.symptoms || '',
      clinical_notes: c?.clinical_notes || '',
      diagnosis: c?.diagnosis || '',
      treatment_plan: c?.treatment_plan || '',
      follow_up_instructions: c?.follow_up_instructions || '',
      consultation_service_id: c?.consultation_service_id || consultService?.id || '',
    });
    setInitialised(true);
  }, [data, services.data, initialised]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const { visit, patient, vitals, consultation, labs, prescriptions, invoice, history } = data;
  const readOnly = !!consultation?.completed;
  const labServices = (services.data?.services || []).filter((s: any) =>
    ['Laboratory', 'Imaging'].includes(s.category),
  );
  const allServices = services.data?.services || [];
  const medications = (inventory.data?.medications || []).filter((m: any) => m.active);
  const allergy =
    patient.allergies && patient.allergies.toLowerCase() !== 'none known' ? patient.allergies : null;
  const status = VISIT_STATUS[visit.status] || { label: visit.status, tone: 'gray' };

  function setField(key: string, value: any) {
    setForm((f: any) => ({ ...f, [key]: value }));
  }

  async function save(complete: boolean) {
    setActionError(null);
    setNotice(null);
    if (complete && !form.diagnosis.trim()) {
      setActionError('Enter a diagnosis before completing the consultation');
      return;
    }
    setBusy(complete ? 'complete' : 'save');
    try {
      await api(`/visits/${visit.id}/consultation`, {
        method: 'POST',
        body: { ...form, complete },
      });
      if (complete) {
        navigate(`/visits/${visit.id}`);
        return;
      }
      setInitialised(false);
      reload();
      setNotice('Consultation notes saved. The patient record is up to date.');
    } catch (err: any) {
      setActionError(err.message || 'Could not save the consultation');
    } finally {
      setBusy(null);
    }
  }

  async function startConsultation() {
    setActionError(null);
    setBusy('start');
    try {
      await api(`/visits/${visit.id}/start-consultation`, { method: 'POST' });
      reload();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function requestTests() {
    if (!selectedTests.length) return;
    setActionError(null);
    setNotice(null);
    setBusy('labs');
    try {
      await api(`/visits/${visit.id}/labs`, {
        method: 'POST',
        body: { tests: selectedTests.map((sid) => ({ service_id: sid })) },
      });
      setSelectedTests([]);
      setInitialised(false);
      reload();
      setNotice('Laboratory request sent. The tests appear in the laboratory queue.');
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function addPrescription(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setNotice(null);
    if (!rx.medication_id && !rx.drug_name.trim()) {
      setActionError('Select a medication or type its name');
      return;
    }
    setBusy('rx');
    try {
      const med = medications.find((m: any) => String(m.id) === String(rx.medication_id));
      await api(`/visits/${visit.id}/prescriptions`, {
        method: 'POST',
        body: {
          ...rx,
          drug_name: med?.name || rx.drug_name,
          quantity: Number(rx.quantity) || 1,
        },
      });
      setRx({ medication_id: '', drug_name: '', dosage: '', frequency: '', duration: '', quantity: 1, instructions: '' });
      setInitialised(false);
      reload();
      setNotice('Prescription sent to the pharmacy.');
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function cancelPrescription(rxId: number) {
    setActionError(null);
    try {
      await api(`/visits/${visit.id}/prescriptions/${rxId}/cancel`, { method: 'POST' });
      setInitialised(false);
      reload();
    } catch (err: any) {
      setActionError(err.message);
    }
  }

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    if (!extraService.service_id || !invoice) return;
    setActionError(null);
    setNotice(null);
    setBusy('service');
    try {
      await api(`/invoices/${invoice.id}/items`, {
        method: 'POST',
        body: { service_id: Number(extraService.service_id), quantity: Number(extraService.quantity) || 1 },
      });
      setExtraService({ service_id: '', quantity: 1 });
      setInitialised(false);
      reload();
      setNotice('Service added to the patient’s bill.');
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Link to="/doctor" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Doctor queue
      </Link>

      <PageHeader
        title={`${patient.full_name} — consultation`}
        subtitle={
          <>
            {patient.patient_no} · {visit.visit_no} · {ageText(patient.age, patient.date_of_birth)} ·{' '}
            {patient.gender === 'male' ? 'Male' : 'Female'} · {visit.reason}
          </>
        }
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {consultation && (
              <Link className="btn btn-secondary" to={`/print/consultation/${visit.id}`} target="_blank">
                <Printer size={14} /> Print summary
              </Link>
            )}
            {!readOnly && (
              <>
                <button className="btn btn-secondary" onClick={() => save(false)} disabled={!!busy}>
                  {busy === 'save' ? 'Saving…' : 'Save draft'}
                </button>
                <button className="btn btn-primary" onClick={() => save(true)} disabled={!!busy}>
                  {busy === 'complete' ? 'Completing…' : 'Complete consultation'}
                </button>
              </>
            )}
          </>
        }
      />

      {allergy && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} />
          <div>
            <strong>Allergy alert:</strong> {allergy}
          </div>
        </div>
      )}

      {visit.status === 'awaiting_doctor' && (
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} />
          <div style={{ flex: 1 }}>
            This patient is waiting in the queue. Start the consultation when you are ready to see them.
          </div>
          <button className="btn btn-secondary btn-sm" onClick={startConsultation} disabled={!!busy}>
            Start consultation
          </button>
        </div>
      )}

      {readOnly && (
        <div className="alert alert-success" style={{ marginBottom: 14 }}>
          <div>
            This consultation was completed on {dateTime(consultation.completed_at)} by {consultation.doctor_name}.
            Records are read-only.
          </div>
        </div>
      )}

      {(actionError || notice) && (
        <div style={{ marginBottom: 14 }}>
          {actionError ? <Alert tone="error">{actionError}</Alert> : <Alert tone="success">{notice}</Alert>}
        </div>
      )}

      <div className="layout-main">
        <div className="stack">
          <Card title="Clinical notes" subtitle="Saved against this visit">
            <div className="stack" style={{ gap: 12 }}>
              <Field label="Symptoms">
                <textarea
                  className="textarea"
                  value={form.symptoms}
                  onChange={(e) => setField('symptoms', e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Clinical notes / examination findings">
                <textarea
                  className="textarea"
                  value={form.clinical_notes}
                  onChange={(e) => setField('clinical_notes', e.target.value)}
                  disabled={readOnly}
                  style={{ minHeight: 100 }}
                />
              </Field>
              <div className="form-grid">
                <Field label="Diagnosis" required>
                  <input
                    className="input"
                    value={form.diagnosis}
                    onChange={(e) => setField('diagnosis', e.target.value)}
                    placeholder="e.g. Malaria"
                    disabled={readOnly}
                  />
                </Field>
                <Field label="Consultation service to bill" hint="Charged when the consultation is completed">
                  <select
                    className="select"
                    value={form.consultation_service_id}
                    onChange={(e) => setField('consultation_service_id', e.target.value)}
                    disabled={readOnly}
                  >
                    <option value="">Use standard consultation fee</option>
                    {allServices
                      .filter((s: any) => s.category === 'Consultation')
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {money(s.price)}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label="Treatment plan">
                <textarea
                  className="textarea"
                  value={form.treatment_plan}
                  onChange={(e) => setField('treatment_plan', e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Follow-up instructions">
                <textarea
                  className="textarea"
                  value={form.follow_up_instructions}
                  onChange={(e) => setField('follow_up_instructions', e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              {!readOnly && (
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => save(false)} disabled={!!busy}>
                    Save draft
                  </button>
                  <button className="btn btn-primary" onClick={() => save(true)} disabled={!!busy}>
                    Complete consultation
                  </button>
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Laboratory requests"
            subtitle="Send tests to the laboratory and bill them automatically"
            actions={<Badge tone="blue">{labs.filter((l: any) => l.status === 'pending' || l.status === 'in_progress').length} open</Badge>}
          >
            {!readOnly && (
              <div className="stack" style={{ gap: 10 }}>
                <div className="form-grid" style={{ gap: 6 }}>
                  {labServices.map((s: any) => (
                    <label
                      key={s.id}
                      className="row"
                      style={{
                        gap: 8,
                        fontSize: 12.5,
                        padding: '6px 0',
                        borderBottom: '1px dashed var(--border)',
                        justifyContent: 'flex-start',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTests.includes(s.id)}
                        onChange={(e) =>
                          setSelectedTests((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                          )
                        }
                      />
                      <span style={{ flex: 1 }}>{s.name}</span>
                      <span className="muted small mono">{money(s.price)}</span>
                    </label>
                  ))}
                </div>
                <div className="row">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={requestTests}
                    disabled={!selectedTests.length || busy === 'labs'}
                  >
                    <FlaskConical size={14} />
                    {busy === 'labs' ? 'Requesting…' : `Request selected (${selectedTests.length})`}
                  </button>
                  <span className="faint tiny">Tests are added to the patient’s bill at the listed price.</span>
                </div>
              </div>
            )}

            {labs.length ? (
              <div className="table-wrap" style={{ marginTop: readOnly ? 0 : 12 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Status</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labs.map((lab: any) => (
                      <tr key={lab.id}>
                        <td>
                          <div className="row-title">{lab.test_name}</div>
                          <div className="row-sub">{dateTime(lab.requested_at)}</div>
                        </td>
                        <td>
                          <Badge tone={LAB_STATUS[lab.status]?.tone || 'gray'}>
                            {LAB_STATUS[lab.status]?.label || lab.status}
                          </Badge>
                        </td>
                        <td className="small" style={{ maxWidth: 260 }}>
                          {lab.result ? (
                            <>
                              {lab.result}
                              {lab.resulted_by_name && (
                                <div className="row-sub">by {lab.resulted_by_name}</div>
                              )}
                            </>
                          ) : (
                            <span className="faint">Awaiting result</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 10 }}>No tests requested for this visit.</div>
            )}
          </Card>

          <Card
            title="Prescriptions"
            subtitle="Sent to the pharmacy immediately; stock is deducted on dispensing"
            actions={<Badge tone="violet">{prescriptions.filter((p: any) => p.status === 'pending').length} pending</Badge>}
          >
            {!readOnly && (
              <form onSubmit={addPrescription} className="stack" style={{ gap: 10 }}>
                <div className="form-grid cols-3">
                  <Field label="Medication" span={2}>
                    <select
                      className="select"
                      value={rx.medication_id}
                      onChange={(e) => {
                        const med = medications.find((m: any) => String(m.id) === e.target.value);
                        setRx((r: any) => ({
                          ...r,
                          medication_id: e.target.value,
                          drug_name: med?.name || '',
                        }));
                      }}
                    >
                      <option value="">Select from inventory…</option>
                      {medications.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.strength || ''} {m.form ? `(${m.form})` : ''} — {money(m.unit_price)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quantity">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={rx.quantity}
                      onChange={(e) => setRx((r: any) => ({ ...r, quantity: e.target.value }))}
                    />
                  </Field>
                  <Field label="Dosage">
                    <input
                      className="input"
                      placeholder="e.g. 500mg"
                      value={rx.dosage}
                      onChange={(e) => setRx((r: any) => ({ ...r, dosage: e.target.value }))}
                    />
                  </Field>
                  <Field label="Frequency">
                    <input
                      className="input"
                      placeholder="e.g. Three times daily"
                      value={rx.frequency}
                      onChange={(e) => setRx((r: any) => ({ ...r, frequency: e.target.value }))}
                    />
                  </Field>
                  <Field label="Duration">
                    <input
                      className="input"
                      placeholder="e.g. 5 days"
                      value={rx.duration}
                      onChange={(e) => setRx((r: any) => ({ ...r, duration: e.target.value }))}
                    />
                  </Field>
                  <Field label="Instructions" span={3}>
                    <input
                      className="input"
                      placeholder="e.g. Take after meals"
                      value={rx.instructions}
                      onChange={(e) => setRx((r: any) => ({ ...r, instructions: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="form-actions">
                  <button className="btn btn-primary btn-sm" type="submit" disabled={busy === 'rx'}>
                    <Pill size={14} /> {busy === 'rx' ? 'Sending…' : 'Prescribe medication'}
                  </button>
                </div>
              </form>
            )}

            {prescriptions.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Medication</th>
                      <th>Directions</th>
                      <th>Quantity</th>
                      <th>Status</th>
                      {!readOnly && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptions.map((p: any) => (
                      <tr key={p.id}>
                        <td className="row-title">{p.drug_name}</td>
                        <td className="small muted">
                          {[p.dosage, p.frequency, p.duration].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="mono small">{p.quantity}</td>
                        <td>
                          <Badge tone={RX_STATUS[p.status]?.tone || 'gray'}>
                            {RX_STATUS[p.status]?.label || p.status}
                          </Badge>
                        </td>
                        {!readOnly && (
                          <td className="right">
                            {p.status === 'pending' && (
                              <button
                                className="icon-btn"
                                title="Cancel prescription"
                                onClick={() => cancelPrescription(p.id)}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 10 }}>No medications prescribed yet.</div>
            )}
          </Card>

          <Card title="Procedures and other services" subtitle="Add a charge to this visit’s bill">
            {!readOnly && (
              <form onSubmit={addService} className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <span className="field-label">Service</span>
                  <select
                    className="select"
                    value={extraService.service_id}
                    onChange={(e) => setExtraService((s) => ({ ...s, service_id: e.target.value }))}
                  >
                    <option value="">Select a service…</option>
                    {allServices.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {money(s.price)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ width: 90 }}>
                  <span className="field-label">Quantity</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={extraService.quantity}
                    onChange={(e) => setExtraService((s) => ({ ...s, quantity: Number(e.target.value) }))}
                  />
                </div>
                <button className="btn btn-secondary" type="submit" disabled={!extraService.service_id || busy === 'service'}>
                  <Plus size={14} /> Add to bill
                </button>
              </form>
            )}
            {invoice?.items?.length ? (
              <div className="stack-sm" style={{ marginTop: 12 }}>
                {invoice.items
                  .filter((i: any) => i.status === 'active')
                  .map((item: any) => (
                    <div className="detail-row" key={item.id}>
                      <span>
                        {item.description}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                      </span>
                      <span className="mono">{money(item.amount)}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 10 }}>No charges on this visit yet.</div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Vital signs" subtitle={vitals ? `Recorded ${dateTime(vitals.recorded_at)}` : 'Not recorded'}>
            {vitals ? (
              <div className="stack" style={{ gap: 12 }}>
                <div className="grid-2">
                  <div>
                    <div className="faint tiny">Blood pressure</div>
                    <div className="row-title mono">
                      {vitals.bp_systolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic}` : '—'} mmHg
                    </div>
                  </div>
                  <div>
                    <div className="faint tiny">Temperature</div>
                    <div className="row-title mono">{vitals.temperature ?? '—'} °C</div>
                  </div>
                  <div>
                    <div className="faint tiny">Pulse</div>
                    <div className="row-title mono">{vitals.pulse ?? '—'} bpm</div>
                  </div>
                  <div>
                    <div className="faint tiny">Respiratory rate</div>
                    <div className="row-title mono">{vitals.resp_rate ?? '—'} /min</div>
                  </div>
                  <div>
                    <div className="faint tiny">SpO₂</div>
                    <div className="row-title mono">{vitals.spo2 ?? '—'} %</div>
                  </div>
                  <div>
                    <div className="faint tiny">Blood glucose</div>
                    <div className="row-title mono">{vitals.glucose ?? '—'} mmol/L</div>
                  </div>
                  <div>
                    <div className="faint tiny">Weight</div>
                    <div className="row-title mono">{vitals.weight ?? '—'} kg</div>
                  </div>
                  <div>
                    <div className="faint tiny">Height</div>
                    <div className="row-title mono">{vitals.height ?? '—'} m</div>
                  </div>
                </div>
                <div>
                  <div className="faint tiny">Presenting complaints</div>
                  <div className="note-box">{vitals.complaints}</div>
                </div>
              </div>
            ) : (
              <div className="alert alert-warn">Nursing has not recorded vitals for this visit.</div>
            )}
          </Card>

          <Card title="Patient history">
            <div className="stack-sm">
              <div>
                <div className="faint tiny">Known conditions</div>
                <div className="small">{patient.conditions || 'None recorded'}</div>
              </div>
              <div>
                <div className="faint tiny">Previous diagnoses</div>
                {history?.diagnoses?.length ? (
                  <div className="stack-sm" style={{ gap: 4, marginTop: 4 }}>
                    {history.diagnoses.map((d: any, i: number) => (
                      <div key={i} className="small">
                        <strong>{d.diagnosis}</strong>
                        <div className="row-sub">{d.visit_no} · {dateTime(d.completed_at || d.created_at)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="small muted">No previous diagnoses</div>
                )}
              </div>
              <div>
                <div className="faint tiny">Recent prescriptions</div>
                {history?.prescriptions?.length ? (
                  <div className="stack-sm" style={{ gap: 4, marginTop: 4 }}>
                    {history.prescriptions.slice(0, 5).map((p: any, i: number) => (
                      <div key={i} className="small">
                        {p.drug_name} — {[p.dosage, p.frequency].filter(Boolean).join(', ')}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="small muted">None</div>
                )}
              </div>
              <div>
                <div className="faint tiny">NHIS</div>
                <div className="small">{patient.nhis_number || 'No NHIS number'} ({patient.nhis_status})</div>
              </div>
            </div>
          </Card>

          {invoice && (
            <Card
              title="Bill summary"
              footer={
                <>
                  <span className="muted small">Balance</span>
                  <strong>{money(invoice.balance)}</strong>
                </>
              }
            >
              <div className="stack-sm">
                {invoice.items
                  .filter((i: any) => i.status === 'active')
                  .map((item: any) => (
                    <div className="detail-row" key={item.id}>
                      <span>{item.description}</span>
                      <span className="mono">{money(item.amount)}</span>
                    </div>
                  ))}
                {!invoice.items.filter((i: any) => i.status === 'active').length && (
                  <div className="muted small">No charges yet.</div>
                )}
                <div className="total-line" style={{ marginTop: 6 }}>
                  <span className="muted">Billed</span>
                  <span>{money(invoice.total)}</span>
                </div>
                <div className="total-line">
                  <span className="muted">Paid</span>
                  <span>{money(invoice.paid)}</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
