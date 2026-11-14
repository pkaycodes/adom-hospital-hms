import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Boxes,
  ClipboardList,
  FlaskConical,
  Pill,
  ReceiptText,
  Stethoscope,
  Users,
  Wallet,
} from 'lucide-react';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, Stat } from '../components/ui';
import { VISIT_STATUS, dateOnly, money, timeOnly, todayIso, waitedFor } from '../format';

export default function Dashboard() {
  const { data, loading, error, reload } = useApi<any>('/dashboard');
  const { has, user } = useAuth();
  const stats = data?.stats;

  const now = new Date().toISOString();
  const greeting =
    new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.full_name?.split(' ')[0] || 'there'}`}
        subtitle={`${dateOnly(now)} · ${user?.role_label} · Africa/Accra`}
        actions={
          <>
            {has('patients.manage') && (
              <Link className="btn btn-secondary" to="/reception">
                <ClipboardList size={15} /> Register or check in
              </Link>
            )}
            {has('payments.manage') && (
              <Link className="btn btn-primary" to="/billing">
                <Wallet size={15} /> Take payment
              </Link>
            )}
            {has('consultation.manage') && (
              <Link className="btn btn-primary" to="/doctor">
                <Stethoscope size={15} /> Doctor queue
              </Link>
            )}
            {has('vitals.manage') && (
              <Link className="btn btn-primary" to="/nursing">
                <Activity size={15} /> Nursing queue
              </Link>
            )}
          </>
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorNote message={error} onRetry={reload} />
        </div>
      )}

      <div className="stat-grid cols-5">
        <Stat
          label="Registered patients"
          value={stats ? stats.total_patients : '—'}
          sub={stats ? `${stats.new_patients_today} registered today` : undefined}
          icon={<Users size={18} />}
          tone="teal"
          to="/patients"
        />
        <Stat
          label="Patients in the hospital"
          value={stats ? stats.active_visits : '—'}
          sub={stats ? `${stats.awaiting_nursing} at nursing · ${stats.awaiting_doctor} waiting` : undefined}
          icon={<Activity size={18} />}
          tone="blue"
          to={has('vitals.manage') ? '/nursing' : '/patients'}
        />
        <Stat
          label="Today's collections"
          value={stats ? money(stats.today_revenue) : '—'}
          sub={
            stats
              ? `Cash ${money(stats.today_revenue_split.cash)} · MoMo ${money(stats.today_revenue_split.momo)}`
              : undefined
          }
          icon={<Wallet size={18} />}
          tone="green"
          to={has('finance.view') ? '/payments' : undefined}
        />
        <Stat
          label="Outstanding balances"
          value={stats ? money(stats.outstanding_total) : '—'}
          sub={stats ? `${stats.awaiting_payment} patients awaiting payment` : undefined}
          icon={<ReceiptText size={18} />}
          tone="amber"
          to={has('billing.view') ? '/billing' : undefined}
        />
        <Stat
          label="Pending laboratory"
          value={stats ? stats.pending_labs : '—'}
          sub={stats ? `${stats.pending_rx} prescriptions to dispense` : undefined}
          icon={<FlaskConical size={18} />}
          tone="violet"
          to={has('labs.manage') ? '/laboratory' : undefined}
        />
      </div>

      {loading && !data ? (
        <Loading label="Loading today's activity…" />
      ) : (
        <div className="layout-main" style={{ marginTop: 16 }}>
          <div className="stack">
            <Card
              title="Nursing queue"
              subtitle="Patients waiting for vital signs and assessment"
              actions={<Link className="btn btn-ghost btn-sm" to={has('vitals.manage') ? '/nursing' : '/patients'}>Open queue <ArrowRight size={14} /></Link>}
              flush
            >
              {data?.queues?.nursing?.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <tbody>
                      {data.queues.nursing.map((v: any) => (
                        <tr key={v.id}>
                          <td>
                            <div className="row-title">{v.patient_name}</div>
                            <div className="row-sub">{v.patient_no} · {v.reason}</div>
                          </td>
                          <td className="right nowrap muted small">Waiting {waitedFor(v.created_at)}</td>
                          <td className="right">
                            <Link className="btn btn-secondary btn-sm" to={`/visits/${v.id}`}>Assess</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No patients waiting" note="Patients checked in at reception will appear here." />
              )}
            </Card>

            <Card
              title="Doctors — waiting and consulting"
              subtitle="Consultations in progress across the clinic"
              actions={<Link className="btn btn-ghost btn-sm" to={has('consultation.manage') ? '/doctor' : '/patients'}>Open queue <ArrowRight size={14} /></Link>}
              flush
            >
              {data?.queues?.doctor?.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <tbody>
                      {data.queues.doctor.map((v: any) => (
                        <tr key={v.id}>
                          <td>
                            <div className="row-title">{v.patient_name}</div>
                            <div className="row-sub">{v.patient_no} · {v.reason}</div>
                          </td>
                          <td>
                            <Badge tone={VISIT_STATUS[v.status]?.tone || 'gray'}>
                              {VISIT_STATUS[v.status]?.label || v.status}
                            </Badge>
                          </td>
                          <td className="right">
                            <Link className="btn btn-secondary btn-sm" to={`/visits/${v.id}`}>Open</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No one is waiting for a doctor" note="Patients appear here after nursing records their vitals." />
              )}
            </Card>

            <div className="grid-2">
              <Card
                title="Laboratory"
                subtitle="Pending and in-progress requests"
                flush
                actions={<Badge tone={data?.labs?.length ? 'amber' : 'green'}>{data?.labs?.length || 0} open</Badge>}
              >
                {data?.labs?.length ? (
                  <div className="table-wrap">
                    <table className="data">
                      <tbody>
                        {data.labs.slice(0, 5).map((l: any) => (
                          <tr key={l.id}>
                            <td>
                              <div className="row-title">{l.test_name}</div>
                              <div className="row-sub">{l.patient_name} · {l.patient_no}</div>
                            </td>
                            <td className="right faint tiny nowrap">{timeOnly(l.requested_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="No pending tests" note="Doctor requests will show here." />
                )}
              </Card>

              <Card
                title="Pharmacy"
                subtitle="Prescriptions awaiting dispensing"
                flush
                actions={<Badge tone={data?.prescriptions?.length ? 'amber' : 'green'}>{data?.prescriptions?.length || 0} open</Badge>}
              >
                {data?.prescriptions?.length ? (
                  <div className="table-wrap">
                    <table className="data">
                      <tbody>
                        {data.prescriptions.slice(0, 5).map((p: any) => (
                          <tr key={p.id}>
                            <td>
                              <div className="row-title">{p.drug_name} × {p.quantity}</div>
                              <div className="row-sub">{p.patient_name} · {p.patient_no}</div>
                            </td>
                            <td className="right faint tiny nowrap">{timeOnly(p.prescribed_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="No prescriptions waiting" note="Dispensed medicines move to the pharmacy history." />
                )}
              </Card>
            </div>

            <Card
              title="Awaiting payment"
              subtitle="Visits with an outstanding balance"
              actions={<Link className="btn btn-ghost btn-sm" to="/billing">Billing <ArrowRight size={14} /></Link>}
              flush
            >
              {data?.queues?.awaiting_payment?.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Visit</th>
                        <th className="right">Balance</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.queues.awaiting_payment.map((v: any) => (
                        <tr key={v.id}>
                          <td>
                            <div className="row-title">{v.patient_name}</div>
                            <div className="row-sub">{v.patient_no} · {v.reason}</div>
                          </td>
                          <td className="muted small">{v.visit_no}</td>
                          <td className="right mono">{money(Math.max(v.billed - v.paid, 0))}</td>
                          <td className="right">
                            <Link className="btn btn-secondary btn-sm" to={`/visits/${v.id}`}>Open</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No outstanding visit balances" note="Every open visit has been settled." />
              )}
            </Card>
          </div>

          <div className="stack">
            <Card title="Today at a glance">
              <div className="detail-list">
                <div className="detail-row"><span>Total registered patients</span><strong>{stats?.total_patients ?? '—'}</strong></div>
                <div className="detail-row"><span>Patients currently visiting</span><strong>{stats?.active_visits ?? '—'}</strong></div>
                <div className="detail-row"><span>Waiting for nursing</span><strong>{stats?.awaiting_nursing ?? '—'}</strong></div>
                <div className="detail-row"><span>Waiting for a doctor</span><strong>{stats?.awaiting_doctor ?? '—'}</strong></div>
                <div className="detail-row"><span>Currently consulting</span><strong>{stats?.consulting ?? '—'}</strong></div>
                <div className="detail-row"><span>Completed consultations today</span><strong>{stats?.completed_today ?? '—'}</strong></div>
                <div className="detail-row"><span>Pending laboratory requests</span><strong>{stats?.pending_labs ?? '—'}</strong></div>
                <div className="detail-row"><span>Patients awaiting payment</span><strong>{stats?.awaiting_payment ?? '—'}</strong></div>
                <div className="detail-row"><span>Today's collections</span><strong>{stats ? money(stats.today_revenue) : '—'}</strong></div>
              </div>
            </Card>

            <Card title="Quick actions">
              <div className="quick-grid">
                {has('patients.manage') && (
                  <Link className="quick" to="/reception"><ClipboardList size={16} /> Register patient</Link>
                )}
                {has('patients.view') && <Link className="quick" to="/patients"><Users size={16} /> Find patient</Link>}
                {has('payments.manage') && <Link className="quick" to="/billing"><Wallet size={16} /> Record payment</Link>}
                {has('labs.manage') && <Link className="quick" to="/laboratory"><FlaskConical size={16} /> Laboratory</Link>}
                {has('prescriptions.dispense') && <Link className="quick" to="/pharmacy"><Pill size={16} /> Pharmacy</Link>}
                {has('medications.manage') && <Link className="quick" to="/medications"><Boxes size={16} /> Inventory</Link>}
                {has('finance.view') && <Link className="quick" to="/finance"><ReceiptText size={16} /> Reports</Link>}
                {has('consultation.manage') && <Link className="quick" to="/doctor"><Stethoscope size={16} /> My queue</Link>}
              </div>
            </Card>

            {data?.low_stock?.length > 0 && (
              <Card title="Low stock alerts" subtitle="At or below reorder level">
                <div className="detail-list">
                  {data.low_stock.map((m: any) => (
                    <div className="detail-row" key={m.id}>
                      <span>{m.name} {m.strength}</span>
                      <Badge tone={m.stock_qty === 0 ? 'red' : 'amber'}>{m.stock_qty} left</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {data?.payments?.length > 0 && (
        <Card
          title="Payments recorded today"
          subtitle="Money collected at the cash desk"
          actions={<Link className="btn btn-ghost btn-sm" to="/payments">All transactions <ArrowRight size={14} /></Link>}
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Patient</th>
                  <th>Method</th>
                  <th>Cashier</th>
                  <th>Time</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="mono small">{p.receipt_no}</td>
                    <td>{p.patient_name}</td>
                    <td><Badge tone={p.method === 'cash' ? 'teal' : 'violet'}>{p.method === 'cash' ? 'Cash' : 'MoMo'}</Badge></td>
                    <td className="muted small">{p.cashier_name}</td>
                    <td className="muted small">{timeOnly(p.paid_at)}</td>
                    <td className="right mono">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="faint tiny" style={{ marginTop: 18 }}>
        {todayIso()} · Records are timestamped in Africa/Accra. Outstanding balances are calculated from recorded
        payments only.
      </div>
    </>
  );
}
