import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp, Wallet } from 'lucide-react';
import { useApi } from '../api';
import { Card, ErrorNote, Loading, PageHeader } from '../components/ui';
import { dateOnly, money, shortDate, todayIso } from '../format';

function firstOfMonth() {
  return `${todayIso().slice(0, 7)}-01`;
}

function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Finance() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const { data, loading, error, reload } = useApi<any>(`/finance/summary?from=${from}&to=${to}`);

  const trend = useMemo(() => {
    const days: { day: string; total: number }[] = [];
    const end = new Date(`${to}T00:00:00Z`);
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const total = (data?.trend || [])
        .filter((t: any) => t.day === key)
        .reduce((sum: number, t: any) => sum + t.total, 0);
      days.push({ day: key, total });
    }
    return days;
  }, [data, to]);
  const trendMax = Math.max(1, ...trend.map((t) => t.total));

  const cash = (data?.collections?.by_method || []).find((m: any) => m.method === 'cash')?.total || 0;
  const momo = (data?.collections?.by_method || []).find((m: any) => m.method === 'momo')?.total || 0;
  const categoryTotal = (data?.by_category || []).reduce((sum: number, c: any) => sum + c.total, 0);

  function preset(kind: 'today' | 'week' | 'month' | '30') {
    if (kind === 'today') {
      setFrom(todayIso());
      setTo(todayIso());
    } else if (kind === 'week') {
      setFrom(daysAgo(6));
      setTo(todayIso());
    } else if (kind === 'month') {
      setFrom(firstOfMonth());
      setTo(todayIso());
    } else {
      setFrom(daysAgo(29));
      setTo(todayIso());
    }
  }

  return (
    <>
      <PageHeader
        title="Finance reports"
        subtitle="Money collected is calculated from recorded payments — separate from bills generated"
        actions={
          <>
            <Link className="btn btn-secondary" to="/payments">
              <Wallet size={14} /> Transactions
            </Link>
            <button className="btn btn-secondary" onClick={reload}>
              Refresh
            </button>
          </>
        }
      />

      <div className="toolbar">
        <label className="row small muted" style={{ gap: 6 }}>
          From
          <input type="date" className="input" style={{ width: 155 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="row small muted" style={{ gap: 6 }}>
          To
          <input type="date" className="input" style={{ width: 155 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => preset('today')}>Today</button>
          <button className="btn btn-ghost btn-sm" onClick={() => preset('week')}>7 days</button>
          <button className="btn btn-ghost btn-sm" onClick={() => preset('month')}>This month</button>
          <button className="btn btn-ghost btn-sm" onClick={() => preset('30')}>30 days</button>
        </div>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Building the financial summary…" />}

      {data && (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="stat-icon tone-green"><TrendingUp size={18} /></div>
              <div>
                <div className="stat-label">Collected in period</div>
                <div className="stat-value">{money(data.collections.total)}</div>
                <div className="stat-sub">{data.collections.count} confirmed payment(s)</div>
              </div>
            </div>
            <div className="stat">
              <div className="stat-icon tone-teal"><Wallet size={18} /></div>
              <div>
                <div className="stat-label">Cash collected</div>
                <div className="stat-value">{money(cash)}</div>
                <div className="stat-sub">Cash desk</div>
              </div>
            </div>
            <div className="stat">
              <div className="stat-icon tone-violet"><Wallet size={18} /></div>
              <div>
                <div className="stat-label">Mobile Money collected</div>
                <div className="stat-value">{money(momo)}</div>
                <div className="stat-sub">Manually confirmed MoMo receipts</div>
              </div>
            </div>
            <div className="stat">
              <div className="stat-icon tone-amber"><TrendingUp size={18} /></div>
              <div>
                <div className="stat-label">Bills generated</div>
                <div className="stat-value">{money(data.bills_generated)}</div>
                <div className="stat-sub">Services charged, not yet money received</div>
              </div>
            </div>
          </div>

          <div className="grid-3" style={{ marginBottom: 16 }}>
            <Card title="Today" subtitle="Collections recorded today">
              <div className="stat-value sm">{money(data.collections.today)}</div>
            </Card>
            <Card title="This week" subtitle="Last 7 days">
              <div className="stat-value sm">{money(data.collections.week)}</div>
            </Card>
            <Card title="This month" subtitle="Month to date">
              <div className="stat-value sm">{money(data.collections.month)}</div>
            </Card>
          </div>

          <div className="layout-main">
            <div className="stack">
              <Card title="Revenue by service category" subtitle={`Bills generated between ${dateOnly(from)} and ${dateOnly(to)}`} flush>
                {data.by_category.length ? (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th className="right">Quantity</th>
                          <th className="right">Billed value</th>
                          <th className="right">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_category.map((c: any) => (
                          <tr key={c.category}>
                            <td className="row-title">{c.category}</td>
                            <td className="right mono small">{c.quantity}</td>
                            <td className="right mono">{money(c.total)}</td>
                            <td className="right small muted">
                              {categoryTotal ? Math.round((c.total / categoryTotal) * 100) : 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2} className="muted">Total billed</td>
                          <td className="right mono" style={{ fontWeight: 700 }}>{money(categoryTotal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="empty"><h3>No bills generated in this period</h3></div>
                )}
              </Card>

              <Card title="Collections by cashier" subtitle="Confirmed payments in the selected period" flush>
                {data.by_cashier.length ? (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Cashier</th>
                          <th className="right">Payments</th>
                          <th className="right">Cash</th>
                          <th className="right">MoMo</th>
                          <th className="right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_cashier.map((c: any) => (
                          <tr key={c.id || 'unknown'}>
                            <td className="row-title">{c.full_name || 'Unknown'}</td>
                            <td className="right mono small">{c.count}</td>
                            <td className="right mono small">{money(c.cash_total)}</td>
                            <td className="right mono small">{money(c.momo_total)}</td>
                            <td className="right mono">{money(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty"><h3>No payments in this period</h3></div>
                )}
              </Card>

              <Card title="Outstanding patient balances" subtitle="All unpaid invoices, regardless of date" flush>
                {data.top_outstanding.length ? (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Patient ID</th>
                          <th className="right">Invoices</th>
                          <th className="right">Balance</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.top_outstanding.map((p: any) => (
                          <tr key={p.id}>
                            <td className="row-title">{p.full_name}</td>
                            <td className="mono small">{p.patient_no}</td>
                            <td className="right mono small">{p.invoices}</td>
                            <td className="right mono">{money(p.balance)}</td>
                            <td className="right">
                              <Link className="btn btn-secondary btn-sm" to={`/patients/${p.id}`}>
                                Open
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty"><h3>No outstanding balances</h3></div>
                )}
                <div className="card-foot">
                  <span className="muted">Total outstanding</span>
                  <strong>{money(data.outstanding.total)}</strong>
                </div>
              </Card>
            </div>

            <div className="stack">
              <Card title="Last 7 days" subtitle="Daily collections (cash + MoMo)">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 120 }}>
                  {trend.map((day) => (
                    <div key={day.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div className="tiny mono faint">{day.total ? Math.round(day.total / 100) : ''}</div>
                      <div
                        title={money(day.total)}
                        style={{
                          width: '100%',
                          height: `${Math.max(4, (day.total / trendMax) * 80)}px`,
                          background: day.total ? 'var(--primary)' : 'var(--border)',
                          borderRadius: 5,
                        }}
                      />
                      <div className="tiny faint">{shortDate(day.day)}</div>
                    </div>
                  ))}
                </div>
                <div className="faint tiny" style={{ marginTop: 8 }}>
                  Values shown in whole Ghana Cedis.
                </div>
              </Card>

              <Card title="Summary">
                <div className="detail-list">
                  <div className="detail-row"><span>Collected in period</span><strong>{money(data.collections.total)}</strong></div>
                  <div className="detail-row"><span>Bills generated</span><strong>{money(data.bills_generated)}</strong></div>
                  <div className="detail-row"><span>Unpaid invoices</span><strong>{data.outstanding.invoices}</strong></div>
                  <div className="detail-row"><span>Outstanding total</span><strong>{money(data.outstanding.total)}</strong></div>
                  <div className="detail-row"><span>Period</span><span>{dateOnly(from)} – {dateOnly(to)}</span></div>
                </div>
                <Link className="btn btn-secondary btn-sm" to="/payments" style={{ marginTop: 12 }}>
                  View all transactions <ArrowRight size={13} />
                </Link>
              </Card>

              <Card title="Monthly report">
                <p className="small muted">
                  Set the date range to a full month to produce a daily and monthly report. The totals above count
                  only payments confirmed by a cashier; generated bills are reported separately so collected money is
                  never confused with charges.
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
