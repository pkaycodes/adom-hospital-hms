import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApi } from '../api';
import { useAuth } from '../auth';
import PatientFormModal from '../components/PatientForm';
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader } from '../components/ui';
import { ageText, dateOnly } from '../format';

export default function Patients() {
  const { has } = useAuth();
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, loading, error, reload } = useApi<any>(`/patients?q=${encodeURIComponent(query)}`);
  const patients = data?.patients || [];

  return (
    <>
      <PageHeader
        title="Patient records"
        subtitle="Search by name, patient ID, phone number or NHIS number"
        actions={
          has('patients.manage') ? (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={15} /> Register patient
            </button>
          ) : undefined
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            className="input"
            placeholder="Search patients…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            autoFocus
          />
        </div>
        <span className="muted small">
          {loading ? 'Searching…' : `${patients.length} patient${patients.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : patients.length === 0 ? (
          <Empty
            title={query ? 'No patients match your search' : 'No patients registered yet'}
            note={query ? 'Try a different name, patient ID or phone number.' : 'Register the first patient to begin.'}
            action={
              has('patients.manage') && !query ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                  Register patient
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Patient ID</th>
                  <th>Age / gender</th>
                  <th>Phone</th>
                  <th>NHIS</th>
                  <th>Visits</th>
                  <th>Last visit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {patients.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/patients/${p.id}`} className="row-title" style={{ color: 'var(--text)' }}>
                        {p.full_name}
                      </Link>
                      {p.allergies && p.allergies.toLowerCase() !== 'none known' && (
                        <div className="row-sub">Allergy: {p.allergies}</div>
                      )}
                    </td>
                    <td className="mono small">{p.patient_no}</td>
                    <td className="muted small nowrap">
                      {ageText(p.age)} · {p.gender === 'male' ? 'Male' : p.gender === 'female' ? 'Female' : 'Other'}
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
                    <td className="mono small">{p.visit_count}</td>
                    <td className="muted small nowrap">{p.last_visit ? dateOnly(p.last_visit) : '—'}</td>
                    <td className="right">
                      <Link className="btn btn-secondary btn-sm" to={`/patients/${p.id}`}>
                        Open record
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PatientFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => reload()}
      />
    </>
  );
}
