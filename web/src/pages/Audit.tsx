import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useApi } from '../api';
import { Card, Empty, ErrorNote, Loading, PageHeader } from '../components/ui';
import { dateTime } from '../format';

export default function Audit() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useApi<any>(`/audit?q=${encodeURIComponent(query)}`);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const logs = data?.logs || [];

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Important clinical, financial and administrative actions, with the staff member responsible"
        actions={
          <button className="btn btn-secondary" onClick={reload}>
            Refresh
          </button>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            className="input"
            placeholder="Search by staff member, action or detail…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <span className="muted small">{logs.length} entries</span>
      </div>

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : logs.length === 0 ? (
          <Empty title="No audit entries match" note="Actions such as registrations, payments and reversals appear here." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Staff member</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id}>
                    <td className="small nowrap muted">{dateTime(log.created_at)}</td>
                    <td className="row-title nowrap">{log.staff_name}</td>
                    <td>
                      <span className="chip">{log.action}</span>
                    </td>
                    <td className="small muted nowrap">{log.entity || '—'}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                    <td className="small" style={{ maxWidth: 380 }}>{log.details || '—'}</td>
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
