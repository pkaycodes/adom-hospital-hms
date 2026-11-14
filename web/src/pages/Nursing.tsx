import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Clock } from 'lucide-react';
import { useApi } from '../api';
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, Tabs } from '../components/ui';
import { ageText, timeOnly, waitedFor } from '../format';

export default function Nursing() {
  const [tab, setTab] = useState<'waiting' | 'assessed'>('waiting');
  const { data, loading, error, reload } = useApi<any>(
    '/visits?status=awaiting_nursing,awaiting_doctor',
  );
  const visits = data?.visits || [];
  const waiting = visits.filter((v: any) => v.status === 'awaiting_nursing');
  const assessed = visits.filter((v: any) => v.status === 'awaiting_doctor');
  const list = tab === 'waiting' ? waiting : assessed;

  return (
    <>
      <PageHeader
        title="Nursing"
        subtitle="Record vital signs and presenting complaints, then send the patient to the doctor"
        actions={
          <button className="btn btn-secondary" onClick={reload}>
            Refresh queue
          </button>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 16 }}>
        <div className="stat">
          <div className="stat-icon tone-amber"><Clock size={18} /></div>
          <div>
            <div className="stat-label">Waiting for assessment</div>
            <div className="stat-value">{waiting.length}</div>
            <div className="stat-sub">Patients checked in by reception</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon tone-teal"><Activity size={18} /></div>
          <div>
            <div className="stat-label">Assessed, waiting for doctor</div>
            <div className="stat-value">{assessed.length}</div>
            <div className="stat-sub">Vitals available to the doctor</div>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'waiting', label: 'Waiting for assessment', count: waiting.length },
          { value: 'assessed', label: 'Assessed', count: assessed.length },
        ]}
      />

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty
            title={tab === 'waiting' ? 'Nursing queue is clear' : 'No assessed patients waiting'}
            note={
              tab === 'waiting'
                ? 'New check-ins from reception will appear here immediately.'
                : 'Patients appear here once their vitals are saved.'
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
                  <th>Checked in</th>
                  <th>Waiting</th>
                  <th>Vitals</th>
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
                    <td className="small nowrap muted">{timeOnly(v.created_at)}</td>
                    <td className="small nowrap">{waitedFor(v.created_at)}</td>
                    <td>
                      {v.vitals_done ? (
                        <Badge tone="green">Recorded</Badge>
                      ) : (
                        <Badge tone="amber">Not recorded</Badge>
                      )}
                    </td>
                    <td className="right">
                      <Link className="btn btn-primary btn-sm" to={`/visits/${v.id}`}>
                        {v.vitals_done ? 'Review' : 'Record vitals'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
