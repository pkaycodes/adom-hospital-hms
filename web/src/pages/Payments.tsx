import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Search } from 'lucide-react';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader } from '../components/ui';
import { dateTime, money, paymentMethod, todayIso } from '../format';

function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Payments() {
  const { has } = useAuth();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [method, setMethod] = useState('');
  const [cashier, setCashier] = useState('');
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    if (method) params.set('method', method);
    if (cashier) params.set('cashier_id', cashier);
    if (query) params.set('q', query);
    return `/payments?${params.toString()}`;
  }, [from, to, method, cashier, query]);

  const { data, loading, error, reload } = useApi<any>(path);
  const staff = useApi<any>(has('admin.manage') ? '/staff' : null);
  const payments = data?.payments || [];

  const totals = payments.reduce(
    (acc: any, p: any) => {
      if (p.status !== 'confirmed') return acc;
      acc.total += p.amount;
      acc[p.method] = (acc[p.method] || 0) + p.amount;
      return acc;
    },
    { total: 0, cash: 0, momo: 0 },
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every recorded cash and Mobile Money payment, with receipt numbers and staff accountability"
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
            placeholder="Receipt, patient, ID or MoMo reference…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <label className="row small muted" style={{ gap: 6 }}>
          From
          <input type="date" className="input" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="row small muted" style={{ gap: 6 }}>
          To
          <input type="date" className="input" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select className="select" style={{ width: 160 }} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>
          <option value="cash">Cash</option>
          <option value="momo">Mobile Money</option>
        </select>
        {has('admin.manage') && (
          <select className="select" style={{ width: 170 }} value={cashier} onChange={(e) => setCashier(e.target.value)}>
            <option value="">All cashiers</option>
            {(staff.data?.staff || []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}>
        <div className="stat">
          <div>
            <div className="stat-label">Payments in range</div>
            <div className="stat-value">{payments.length}</div>
            <div className="stat-sub">{from} to {to}</div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="stat-label">Cash collected</div>
            <div className="stat-value">{money(totals.cash)}</div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="stat-label">Mobile Money collected</div>
            <div className="stat-value">{money(totals.momo)}</div>
            <div className="stat-sub">Total confirmed: {money(totals.total)}</div>
          </div>
        </div>
      </div>

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : payments.length === 0 ? (
          <Empty title="No payments found" note="Adjust the date range or filters to see more transactions." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date & time</th>
                  <th>Patient</th>
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Cashier</th>
                  <th>Status</th>
                  <th className="right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="mono small nowrap">{p.receipt_no}</td>
                    <td className="small nowrap">{dateTime(p.paid_at)}</td>
                    <td>
                      <Link to={`/patients/${p.patient_id}`} style={{ color: 'var(--text)' }} className="row-title">
                        {p.patient_name}
                      </Link>
                      <div className="row-sub">{p.patient_no}</div>
                    </td>
                    <td className="small">
                      <Link to={`/billing/${p.invoice_id}`}>{p.invoice_no}</Link>
                    </td>
                    <td><Badge tone={p.method === 'cash' ? 'teal' : 'violet'}>{paymentMethod(p.method)}</Badge></td>
                    <td className="small muted">{p.momo_reference || '—'}</td>
                    <td className="small">{p.cashier_name || '—'}</td>
                    <td>
                      {p.status === 'confirmed' ? (
                        <Badge tone="green">Confirmed</Badge>
                      ) : (
                        <Badge tone="red">Reversed</Badge>
                      )}
                    </td>
                    <td className="right mono">{money(p.amount)}</td>
                    <td className="right">
                      <Link
                        className="btn btn-secondary btn-sm"
                        to={`/print/receipt/${p.invoice_id}/${p.id}`}
                        target="_blank"
                      >
                        <Printer size={13} /> Receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="faint tiny" style={{ marginTop: 12 }}>
        Collections are calculated from confirmed payments only. Reversed payments stay visible for accountability.
      </div>
    </>
  );
}
