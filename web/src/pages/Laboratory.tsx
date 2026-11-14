import { useState } from 'react';
import { FlaskConical, Play } from 'lucide-react';
import { api, useApi } from '../api';
import { Alert, Badge, Card, Empty, ErrorNote, Field, Loading, Modal, PageHeader, Tabs } from '../components/ui';
import { LAB_STATUS, ageText, dateTime, timeOnly } from '../format';

export default function Laboratory() {
  const [tab, setTab] = useState<'pending' | 'in_progress' | 'completed'>('pending');
  const { data, loading, error, reload } = useApi<any>('/lab?status=pending,in_progress,completed');
  const [current, setCurrent] = useState<any>(null);
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requests = data?.requests || [];
  const pending = requests.filter((r: any) => r.status === 'pending');
  const inProgress = requests.filter((r: any) => r.status === 'in_progress');
  const completed = requests.filter((r: any) => r.status === 'completed');
  const list = tab === 'pending' ? pending : tab === 'in_progress' ? inProgress : completed;

  async function startRequest(lab: any) {
    try {
      await api(`/lab/${lab.id}`, { method: 'PATCH', body: { status: 'in_progress' } });
      reload();
    } catch (err: any) {
      setModalError(err.message);
    }
  }

  async function submitResult(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (!result.trim()) {
      setModalError('Enter the test result');
      return;
    }
    setBusy(true);
    try {
      await api(`/lab/${current.id}`, {
        method: 'PATCH',
        body: { status: 'completed', result: result.trim(), result_notes: notes.trim() },
      });
      setCurrent(null);
      setResult('');
      setNotes('');
      reload();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Laboratory"
        subtitle="Process doctor requests and publish results to the patient record"
        actions={
          <button className="btn btn-secondary" onClick={reload}>
            Refresh
          </button>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pending', label: 'Pending', count: pending.length },
          { value: 'in_progress', label: 'In progress', count: inProgress.length },
          { value: 'completed', label: 'Completed', count: completed.length },
        ]}
      />

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty
            title={tab === 'completed' ? 'No completed tests yet' : 'No laboratory requests here'}
            note={
              tab === 'completed'
                ? 'Results you complete will be listed here and visible to the doctor.'
                : 'Tests requested during consultations appear here immediately.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Test</th>
                  <th>Requested by</th>
                  <th>Requested</th>
                  <th>Status</th>
                  {tab === 'completed' ? <th>Result</th> : <th />}
                </tr>
              </thead>
              <tbody>
                {list.map((lab: any) => (
                  <tr key={lab.id}>
                    <td>
                      <div className="row-title">{lab.patient_name}</div>
                      <div className="row-sub">
                        {lab.patient_no} · {ageText(null)} {lab.gender === 'male' ? 'M' : 'F'} · {lab.visit_no}
                      </div>
                    </td>
                    <td>
                      <div className="row-title">{lab.test_name}</div>
                      {lab.allergies && lab.allergies.toLowerCase() !== 'none known' && (
                        <div className="row-sub">Allergy: {lab.allergies}</div>
                      )}
                    </td>
                    <td className="small muted">{lab.requested_by_name || lab.doctor_name || 'Doctor'}</td>
                    <td className="small nowrap muted">
                      {timeOnly(lab.requested_at)}
                      <div className="row-sub">{dateTime(lab.requested_at).split(',')[0]}</div>
                    </td>
                    <td>
                      <Badge tone={LAB_STATUS[lab.status]?.tone || 'gray'}>
                        {LAB_STATUS[lab.status]?.label || lab.status}
                      </Badge>
                    </td>
                    {tab === 'completed' ? (
                      <td style={{ maxWidth: 280 }}>
                        <div className="small">{lab.result}</div>
                        <div className="row-sub">
                          {lab.resulted_by_name} · {dateTime(lab.resulted_at)}
                        </div>
                      </td>
                    ) : (
                      <td className="right">
                        <div className="actions-cell">
                          {lab.status === 'pending' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => startRequest(lab)}>
                              <Play size={13} /> Start
                            </button>
                          )}
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setCurrent(lab);
                              setResult(lab.result || '');
                              setNotes(lab.result_notes || '');
                              setModalError(null);
                            }}
                          >
                            <FlaskConical size={14} /> Enter result
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!current}
        title="Enter laboratory result"
        subtitle={current ? `${current.test_name} · ${current.patient_name} · ${current.visit_no}` : ''}
        onClose={() => setCurrent(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCurrent(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="lab-result-form" disabled={busy}>
              {busy ? 'Saving…' : 'Save result and complete'}
            </button>
          </>
        }
      >
        <form id="lab-result-form" onSubmit={submitResult} className="stack" style={{ gap: 14 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <Field label="Result" required>
            <textarea
              className="textarea"
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="e.g. Malaria RDT positive (Pf) / Hb 12.1 g/dL, WBC 6.4 ×10⁹/L"
              autoFocus
              style={{ minHeight: 100 }}
            />
          </Field>
          <Field label="Technician notes" hint="Optional — visible to the doctor">
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="alert alert-info">
            <FlaskConical size={15} />
            <div>Saving makes the result immediately visible on the doctor’s consultation screen.</div>
          </div>
        </form>
      </Modal>
    </>
  );
}
