import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, PackageCheck, Pill } from 'lucide-react';
import { api, useApi } from '../api';
import { Alert, Badge, Card, Empty, ErrorNote, Field, Loading, Modal, PageHeader, Tabs } from '../components/ui';
import { RX_STATUS, dateTime, money, timeOnly, todayIso } from '../format';

export default function Pharmacy() {
  const [tab, setTab] = useState<'pending' | 'dispensed'>('pending');
  const pending = useApi<any>('/pharmacy?status=pending');
  const dispensed = useApi<any>('/pharmacy?status=dispensed');
  const inventory = useApi<any>('/pharmacy/inventory/list');

  const [current, setCurrent] = useState<any>(null);
  const [reasonFor, setReasonFor] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pendingList = pending.data?.prescriptions || [];
  const dispensedList = (dispensed.data?.prescriptions || []).filter(
    (rx: any) => rx.dispensed_at?.slice(0, 10) === todayIso(),
  );
  const meds = inventory.data?.medications || [];
  const lowStock = meds.filter((m: any) => m.active && m.stock_qty <= m.reorder_level);
  const currentStock = current
    ? meds.find((m: any) => m.id === current.medication_id)?.stock_qty
    : undefined;

  async function dispense() {
    setError(null);
    setBusy(true);
    try {
      await api(`/pharmacy/${current.id}/dispense`, { method: 'POST' });
      setCurrent(null);
      pending.reload();
      dispensed.reload();
      inventory.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function markUnavailable(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('State why the medication cannot be dispensed');
      return;
    }
    setBusy(true);
    try {
      await api(`/pharmacy/${reasonFor.id}/unavailable`, {
        method: 'POST',
        body: { reason: reason.trim() },
      });
      setReasonFor(null);
      setReason('');
      pending.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Pharmacy"
        subtitle="Dispense prescribed medicines and keep stock accurate"
        actions={
          <Link className="btn btn-secondary" to="/medications">
            <Pill size={14} /> Manage inventory
          </Link>
        }
      />

      {(pending.error || dispensed.error) && (
        <ErrorNote message={pending.error || dispensed.error || ''} onRetry={pending.reload} />
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pending', label: 'Awaiting dispensing', count: pendingList.length },
          { value: 'dispensed', label: 'Dispensed today', count: dispensedList.length },
        ]}
      />

      <div className="layout-main">
        <Card flush>
          {tab === 'pending' ? (
            pending.loading && !pending.data ? (
              <Loading />
            ) : pendingList.length === 0 ? (
              <Empty
                title="No prescriptions waiting"
                note="Prescriptions written by doctors appear here immediately."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Medication</th>
                      <th>Directions</th>
                      <th>Qty</th>
                      <th>Prescribed</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pendingList.map((rx: any) => {
                      const stock = meds.find((m: any) => m.id === rx.medication_id)?.stock_qty;
                      const insufficient = stock !== undefined && stock < rx.quantity;
                      return (
                        <tr key={rx.id}>
                          <td>
                            <div className="row-title">{rx.patient_name}</div>
                            <div className="row-sub">
                              {rx.patient_no} · {rx.visit_no}
                            </div>
                            {rx.allergies && rx.allergies.toLowerCase() !== 'none known' && (
                              <div className="row-sub" style={{ color: 'var(--danger)' }}>
                                Allergy: {rx.allergies}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="row-title">
                              {rx.drug_name} {rx.strength || ''}
                            </div>
                            <div className="row-sub">
                              {rx.form || ''} · stock {stock === undefined ? 'n/a' : stock}
                              {insufficient && <span style={{ color: 'var(--danger)' }}> · insufficient</span>}
                            </div>
                          </td>
                          <td className="small muted">
                            {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="mono small">{rx.quantity}</td>
                          <td className="small muted nowrap">
                            {timeOnly(rx.prescribed_at)}
                            <div className="row-sub">by {rx.prescribed_by_name}</div>
                          </td>
                          <td className="right">
                            <div className="actions-cell">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setReasonFor(rx);
                                  setReason('');
                                  setError(null);
                                }}
                              >
                                Unavailable
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  setCurrent(rx);
                                  setError(null);
                                }}
                                disabled={insufficient}
                              >
                                <PackageCheck size={14} /> Dispense
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : dispensed.loading && !dispensed.data ? (
            <Loading />
          ) : dispensedList.length === 0 ? (
            <Empty title="Nothing dispensed today" note="Medicines dispensed today will be listed here." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Medication</th>
                    <th>Qty</th>
                    <th>Dispensed by</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dispensedList.map((rx: any) => (
                    <tr key={rx.id}>
                      <td>
                        <div className="row-title">{rx.patient_name}</div>
                        <div className="row-sub">{rx.patient_no}</div>
                      </td>
                      <td className="row-title">{rx.drug_name}</td>
                      <td className="mono small">{rx.quantity}</td>
                      <td className="small muted">{rx.dispensed_by_name}</td>
                      <td className="small nowrap">{dateTime(rx.dispensed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card
            title="Low stock"
            subtitle="At or below reorder level"
            actions={<Badge tone={lowStock.length ? 'amber' : 'green'}>{lowStock.length}</Badge>}
          >
            {lowStock.length ? (
              <div className="detail-list">
                {lowStock.map((m: any) => (
                  <div className="detail-row" key={m.id}>
                    <span>
                      {m.name} {m.strength || ''}
                    </span>
                    <Badge tone={m.stock_qty === 0 ? 'red' : 'amber'}>{m.stock_qty} left</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="small muted">All medicines are above their reorder level.</div>
            )}
          </Card>

          <Card title="Dispensing rules">
            <ul className="small muted" style={{ paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
              <li>Stock is deducted only when you confirm dispensing.</li>
              <li>Medicine charges are added to the patient’s bill automatically.</li>
              <li>If stock is insufficient, mark the item unavailable so the doctor can review.</li>
              <li>Dispensing cannot be undone by pharmacy staff.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={!!current}
        title="Confirm dispensing"
        subtitle={current ? `${current.drug_name} × ${current.quantity} for ${current.patient_name}` : ''}
        onClose={() => setCurrent(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCurrent(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={dispense} disabled={busy}>
              {busy ? 'Dispensing…' : 'Confirm dispense'}
            </button>
          </>
        }
      >
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {current && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="alert alert-info">
              <Pill size={15} />
              <div>
                Stock on hand: <strong>{currentStock ?? 'not tracked'}</strong> · After dispensing:{' '}
                <strong>{currentStock !== undefined ? currentStock - current.quantity : '—'}</strong>
              </div>
            </div>
            <div className="detail-list">
              <div className="detail-row"><span>Directions</span><span>{[current.dosage, current.frequency, current.duration].filter(Boolean).join(' · ') || '—'}</span></div>
              <div className="detail-row"><span>Instructions</span><span>{current.instructions || '—'}</span></div>
              <div className="detail-row"><span>Prescribed by</span><span>{current.prescribed_by_name}</span></div>
              <div className="detail-row"><span>Patient allergies</span><span>{current.allergies || 'None recorded'}</span></div>
              <div className="detail-row"><span>Charge to add</span><span>{money(current.price * current.quantity)}</span></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!reasonFor}
        title="Medication unavailable"
        subtitle={reasonFor ? `${reasonFor.drug_name} · ${reasonFor.patient_name}` : ''}
        onClose={() => setReasonFor(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReasonFor(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="unavailable-form" disabled={busy}>
              {busy ? 'Saving…' : 'Mark unavailable'}
            </button>
          </>
        }
      >
        <form id="unavailable-form" onSubmit={markUnavailable} className="stack" style={{ gap: 12 }}>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Reason" required hint="The doctor sees this note on the visit">
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Out of stock — patient advised to buy outside"
              autoFocus
            />
          </Field>
          <div className="alert alert-warn">
            <AlertTriangle size={15} />
            <div>
              The prescription stays on the patient record as unavailable and is not charged to the bill.
            </div>
          </div>
        </form>
      </Modal>

      <div className="faint tiny" style={{ marginTop: 14 }}>
        Prescriptions shown for today · stock quantities update immediately after dispensing.
      </div>
    </>
  );
}
