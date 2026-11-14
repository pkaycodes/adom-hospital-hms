import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import { api, useApi } from '../api';
import { Alert, Badge, Card, Empty, ErrorNote, Loading, PageHeader, Tabs } from '../components/ui';
import { ageText, timeOnly, waitedFor } from '../format';

export default function DoctorQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'waiting' | 'consulting'>('waiting');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, loading, error: loadError, reload } = useApi<any>(
    '/visits?status=awaiting_doctor,consulting',
  );

  const visits = data?.visits || [];
  const waiting = visits.filter((v: any) => v.status === 'awaiting_doctor');
  const consulting = visits.filter((v: any) => v.status === 'consulting');
  const list = tab === 'waiting' ? waiting : consulting;

  async function open(v: any) {
    setError(null);
    if (v.status === 'consulting') {
      navigate(`/consultation/${v.id}`);
      return;
    }
    setBusy(v.id);
    try {
      await api(`/visits/${v.id}/start-consultation`, { method: 'POST' });
      navigate(`/consultation/${v.id}`);
    } catch (err: any) {
      setError(err.message || 'Could not start the consultation');
      reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Doctor queue"
        subtitle="Patients who have been assessed by nursing and are ready to be seen"
        actions={
          <button className="btn btn-secondary" onClick={reload}>
            Refresh queue
          </button>
        }
      />

      {(error || loadError) && (
        <div style={{ marginBottom: 14 }}>
          <ErrorNote message={error || loadError || ''} onRetry={reload} />
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'waiting', label: 'Waiting for consultation', count: waiting.length },
          { value: 'consulting', label: 'In consultation', count: consulting.length },
        ]}
      />

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty
            title={tab === 'waiting' ? 'No patients waiting' : 'No consultations in progress'}
            note={
              tab === 'waiting'
                ? 'Patients appear here as soon as nursing saves their vital signs.'
                : 'Open a patient to continue recording notes, diagnoses and prescriptions.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Age / gender</th>
                  <th>Reason for visit</th>
                  <th>Vitals</th>
                  <th>Waiting</th>
                  <th>Doctor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((v: any) => (
                  <tr key={v.id}>
                    <td>
                      <div className="row-title">{v.patient_name}</div>
                      <div className="row-sub">{v.patient_no} · {v.visit_no}</div>
                    </td>
                    <td className="small muted nowrap">
                      {ageText(v.age)} · {v.gender === 'male' ? 'M' : 'F'}
                    </td>
                    <td className="small" style={{ maxWidth: 260 }}>{v.reason}</td>
                    <td>
                      {v.vitals_done ? <Badge tone="green">Recorded</Badge> : <Badge tone="amber">Missing</Badge>}
                    </td>
                    <td className="small nowrap">
                      {waitedFor(v.created_at)}
                      <div className="row-sub">in at {timeOnly(v.created_at)}</div>
                    </td>
                    <td className="small muted">{v.doctor_name || '—'}</td>
                    <td className="right">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => open(v)}
                        disabled={busy === v.id}
                      >
                        <Stethoscope size={14} />
                        {busy === v.id
                          ? 'Opening…'
                          : v.status === 'consulting'
                            ? 'Continue'
                            : 'Start consultation'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <Stethoscope size={15} />
        <div>
          Consultation notes are saved to the visit. You can request laboratory tests and prescribe medicines while
          the consultation is open; both reach their departments immediately.
        </div>
      </div>
    </>
  );
}
