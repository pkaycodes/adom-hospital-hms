import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptText, Search, Wallet } from 'lucide-react';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, Stat, Tabs } from '../components/ui';
import { INVOICE_STATUS, dateOnly, money, timeOnly } from '../format';

export default function Billing() {
  const { has } = useAuth();
  const [tab, setTab] = useState<'unpaid' | 'settled' | 'all'>('unpaid');
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, loading, error, reload } = useApi<any>(
    `/invoices?filter=${tab}&q=${encodeURIComponent(query)}`,
  );
  const invoices = data?.invoices || [];
  const outstanding = invoices.reduce((sum: number, i: any) => sum + (i.balance || 0), 0);

  return (
    <>
      <PageHeader
        title="Billing & payments"
        subtitle="Bills are built from services added during the visit; money counts only when a payment is recorded"
        actions={
          <button className="btn btn-secondary" onClick={reload}>
            Refresh
          </button>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}>
        <Stat
          label={tab === 'unpaid' ? 'Outstanding invoices' : 'Invoices listed'}
          value={invoices.length}
          sub={tab === 'unpaid' ? 'Patients with a balance' : 'Matching the current filter'}
          icon={<ReceiptText size={18} />}
          tone="amber"
        />
        <Stat
          label={tab === 'unpaid' ? 'Total outstanding' : 'Balance shown'}
          value={money(outstanding)}
          sub="Excludes reversed payments"
          icon={<Wallet size={18} />}
          tone="teal"
        />
        <Stat
          label="Payment methods"
          value="Cash · MoMo"
          sub="Mobile Money is confirmed and recorded manually"
          icon={<Wallet size={18} />}
          tone="violet"
        />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'unpaid', label: 'Awaiting payment' },
          { value: 'settled', label: 'Settled' },
          { value: 'all', label: 'All invoices' },
        ]}
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            className="input"
            placeholder="Search invoice number, patient name, ID or phone…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <span className="muted small">
          {loading ? 'Loading…' : `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
        </span>
        {has('finance.view') && (
          <Link className="btn btn-ghost btn-sm" to="/payments" style={{ marginLeft: 'auto' }}>
            Transaction history
          </Link>
        )}
      </div>

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : invoices.length === 0 ? (
          <Empty
            title={tab === 'unpaid' ? 'No outstanding bills' : 'No invoices found'}
            note={
              tab === 'unpaid'
                ? 'Every visit with charges has been settled.'
                : 'Invoices are created automatically when a patient is checked in.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Patient</th>
                  <th>Visit</th>
                  <th>Created</th>
                  <th className="right">Billed</th>
                  <th className="right">Paid</th>
                  <th className="right">Balance</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="mono small nowrap">{inv.invoice_no}</td>
                    <td>
                      <Link to={`/patients/${inv.patient_id}`} className="row-title" style={{ color: 'var(--text)' }}>
                        {inv.patient_name}
                      </Link>
                      <div className="row-sub">{inv.patient_no}</div>
                    </td>
                    <td className="mono small nowrap">
                      {inv.visit_no}
                      <div className="row-sub">{timeOnly(inv.created_at)}</div>
                    </td>
                    <td className="small nowrap muted">{dateOnly(inv.created_at)}</td>
                    <td className="right mono small">{money(inv.billed)}</td>
                    <td className="right mono small">{money(inv.paid_amount)}</td>
                    <td className="right mono" style={{ fontWeight: 650 }}>
                      {money(inv.balance)}
                    </td>
                    <td>
                      <Badge tone={INVOICE_STATUS[inv.status]?.tone || 'gray'}>
                        {INVOICE_STATUS[inv.status]?.label || inv.status}
                      </Badge>
                    </td>
                    <td className="right">
                      <Link className="btn btn-secondary btn-sm" to={`/billing/${inv.id}`}>
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

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <Wallet size={15} />
        <div>
          Partial payments are allowed and multiple payments can be recorded against one invoice. Cashiers cannot
          delete payments; an administrator can reverse one with a reason, which is kept in the audit trail.
        </div>
      </div>
    </>
  );
}
