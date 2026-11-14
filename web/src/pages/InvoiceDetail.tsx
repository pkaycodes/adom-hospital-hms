import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Printer, RotateCcw, Wallet } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Alert, Badge, Card, Empty, ErrorNote, Field, Loading, Modal, PageHeader } from '../components/ui';
import { INVOICE_STATUS, dateTime, money, paymentMethod, toPesewas } from '../format';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { has, user } = useAuth();
  const { data, loading, error, reload } = useApi<any>(`/invoices/${id}`);
  const services = useApi<any>('/services');

  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'momo'>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [reverseFor, setReverseFor] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const invoice = data.invoice;
  const items = invoice.items.filter((i: any) => i.status === 'active');
  const payments = invoice.payments || [];
  const status = INVOICE_STATUS[invoice.status] || { label: invoice.status, tone: 'gray' };

  function openPayment() {
    setAmount((invoice.balance / 100).toFixed(2));
    setMethod('cash');
    setReference('');
    setNotes('');
    setPayError(null);
    setPayOpen(true);
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    setPayError(null);
    const pesewas = toPesewas(amount);
    if (!pesewas || pesewas <= 0) {
      setPayError('Enter the amount received');
      return;
    }
    if (pesewas > invoice.balance) {
      setPayError('The amount is more than the outstanding balance');
      return;
    }
    setBusy(true);
    try {
      const result = await api<any>(`/invoices/${invoice.id}/payments`, {
        method: 'POST',
        body: { amount: pesewas, method, momo_reference: method === 'momo' ? reference : null, notes },
      });
      setPayOpen(false);
      setNotice(`Payment recorded. Receipt ${result.payment.receipt_no} is ready to print.`);
      reload();
    } catch (err: any) {
      setPayError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId) return;
    setBusy(true);
    setModalError(null);
    try {
      await api(`/invoices/${invoice.id}/items`, {
        method: 'POST',
        body: { service_id: Number(serviceId), quantity: Number(quantity) || 1 },
      });
      setAddOpen(false);
      setServiceId('');
      setQuantity(1);
      reload();
      setNotice('Service added to the bill.');
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reversePayment(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (!reason.trim()) {
      setModalError('A reason is required');
      return;
    }
    setBusy(true);
    try {
      await api(`/payments/${reverseFor.id}/reverse`, { method: 'POST', body: { reason: reason.trim() } });
      setReverseFor(null);
      setReason('');
      reload();
      setNotice('Payment reversed. The balance has been restored and the action is in the audit log.');
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/billing" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Billing
      </Link>

      <PageHeader
        title={invoice.invoice_no}
        subtitle={
          <>
            {invoice.patient_name} · {invoice.patient_no} · Visit {invoice.visit_no}
          </>
        }
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Link className="btn btn-secondary" to={`/print/invoice/${invoice.id}`} target="_blank">
              <Printer size={14} /> Print bill
            </Link>
            {has('billing.manage') && (
              <button className="btn btn-secondary" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> Add service
              </button>
            )}
            {has('payments.manage') && invoice.balance > 0 && (
              <button className="btn btn-primary" onClick={openPayment}>
                <Wallet size={15} /> Record payment
              </button>
            )}
          </>
        }
      />

      {notice && (
        <div style={{ marginBottom: 14 }}>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}>
        <div className="stat">
          <div>
            <div className="stat-label">Total billed</div>
            <div className="stat-value">{money(invoice.total)}</div>
            <div className="stat-sub">{items.length} billable items</div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="stat-label">Paid to date</div>
            <div className="stat-value" style={{ color: 'var(--ok)' }}>{money(invoice.paid)}</div>
            <div className="stat-sub">{payments.filter((p: any) => p.status === 'confirmed').length} payment(s)</div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="stat-label">Outstanding balance</div>
            <div className="stat-value" style={{ color: invoice.balance ? 'var(--warn)' : 'var(--ok)' }}>
              {money(invoice.balance)}
            </div>
            <div className="stat-sub">Only recorded payments reduce this</div>
          </div>
        </div>
      </div>

      <div className="layout-main">
        <div className="stack">
          <Card title="Bill items" subtitle="Services, tests and medicines charged to this visit" flush>
            {items.length === 0 ? (
              <Empty
                title="No charges on this bill"
                note="The doctor or cash desk can add services, laboratory tests and dispensed medicines."
                action={
                  has('billing.manage') ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => setAddOpen(true)}>
                      Add a service
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Category</th>
                      <th className="right">Unit price</th>
                      <th className="right">Qty</th>
                      <th className="right">Amount</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any) => (
                      <tr key={item.id}>
                        <td className="row-title">{item.description}</td>
                        <td><span className="chip">{item.category || 'Other'}</span></td>
                        <td className="right mono small">{money(item.unit_price)}</td>
                        <td className="right mono small">{item.quantity}</td>
                        <td className="right mono">{money(item.amount)}</td>
                        <td className="small muted nowrap">{dateTime(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: 24 }}>
              <span className="muted">Total</span>
              <strong style={{ fontSize: 16 }}>{money(invoice.total)}</strong>
            </div>
          </Card>

          <Card
            title="Payment history"
            subtitle="Every payment is individually receipted and cannot be deleted"
            actions={<Badge tone={invoice.balance > 0 ? 'amber' : 'green'}>{invoice.balance > 0 ? 'Balance due' : 'Settled'}</Badge>}
            flush
          >
            {payments.length === 0 ? (
              <Empty title="No payments recorded" note="Record a cash or Mobile Money payment when the hospital receives it." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Date & time</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Recorded by</th>
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
                          <Badge tone={p.method === 'cash' ? 'teal' : 'violet'}>{paymentMethod(p.method)}</Badge>
                        </td>
                        <td className="small muted">{p.momo_reference || '—'}</td>
                        <td className="small muted">{p.cashier_name || '—'}</td>
                        <td>
                          {p.status === 'confirmed' ? (
                            <Badge tone="green">Confirmed</Badge>
                          ) : (
                            <Badge tone="red">Reversed</Badge>
                          )}
                          {p.status === 'reversed' && p.reversal_reason && (
                            <div className="row-sub">{p.reversal_reason}</div>
                          )}
                        </td>
                        <td className="right mono">{money(p.amount)}</td>
                        <td>
                          <div className="actions-cell">
                            <Link
                              className="btn btn-secondary btn-sm"
                              to={`/print/receipt/${invoice.id}/${p.id}`}
                              target="_blank"
                            >
                              Receipt
                            </Link>
                            {user?.role === 'admin' && p.status === 'confirmed' && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                  setReverseFor(p);
                                  setReason('');
                                  setModalError(null);
                                }}
                              >
                                <RotateCcw size={13} /> Reverse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Patient">
            <div className="stack-sm">
              <div>
                <div className="faint tiny">Name</div>
                <Link to={`/patients/${invoice.patient_id}`} className="row-title">
                  {invoice.patient_name}
                </Link>
              </div>
              <div>
                <div className="faint tiny">Patient ID</div>
                <div className="mono small">{invoice.patient_no}</div>
              </div>
              <div>
                <div className="faint tiny">Phone</div>
                <div className="small">{invoice.patient_phone || '—'}</div>
              </div>
              <div>
                <div className="faint tiny">Visit</div>
                <Link to={`/visits/${invoice.visit_id}`} className="small">{invoice.visit_no}</Link>
              </div>
              <div>
                <div className="faint tiny">Created</div>
                <div className="small">{dateTime(invoice.created_at)}</div>
              </div>
            </div>
          </Card>

          <Card title="Payment policy">
            <ul className="small muted" style={{ paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
              <li>Only Cash and Mobile Money are accepted.</li>
              <li>MoMo is paid outside the system; record it after confirming receipt.</li>
              <li>Bills are never marked paid automatically.</li>
              <li>Cashiers cannot delete a payment. Administrators reverse with a reason.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={payOpen}
        title="Record payment"
        subtitle={`${invoice.invoice_no} · balance ${money(invoice.balance)}`}
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPayOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="payment-form" disabled={busy}>
              {busy ? 'Recording…' : 'Confirm payment'}
            </button>
          </>
        }
      >
        <form id="payment-form" onSubmit={recordPayment} className="stack" style={{ gap: 14 }}>
          {payError && <Alert tone="error">{payError}</Alert>}
          <div className="row" style={{ gap: 10 }}>
            <Field label="Amount received (GH₵)" required>
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Outstanding">
              <input className="input" value={money(invoice.balance)} disabled />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Payment method</span>
            <div className="row">
              <button
                type="button"
                className={`btn ${method === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMethod('cash')}
              >
                Cash
              </button>
              <button
                type="button"
                className={`btn ${method === 'momo' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMethod('momo')}
              >
                Mobile Money
              </button>
            </div>
          </div>
          {method === 'momo' && (
            <Field label="MoMo transaction reference" hint="Optional — from the patient’s payment message">
              <input
                className="input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. MP260113.1422.A88210"
              />
            </Field>
          )}
          <Field label="Note" hint="Optional">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="alert alert-info">
            <Wallet size={15} />
            <div>
              This records money already received. The receipt is issued immediately and the balance updates.
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={addOpen}
        title="Add a service to this bill"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="add-service-form" disabled={busy}>
              {busy ? 'Adding…' : 'Add to bill'}
            </button>
          </>
        }
      >
        <form id="add-service-form" onSubmit={addService} className="stack" style={{ gap: 14 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <Field label="Service" required>
            <select className="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)} autoFocus>
              <option value="">Select a service…</option>
              {(services.data?.services || []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {money(s.price)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input
              className="input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!reverseFor}
        title="Reverse payment"
        subtitle={reverseFor ? `${reverseFor.receipt_no} · ${money(reverseFor.amount)}` : ''}
        onClose={() => setReverseFor(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReverseFor(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" type="submit" form="reverse-form" disabled={busy}>
              {busy ? 'Reversing…' : 'Reverse payment'}
            </button>
          </>
        }
      >
        <form id="reverse-form" onSubmit={reversePayment} className="stack" style={{ gap: 14 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <Alert tone="warn">
            Reversing restores the outstanding balance. The original payment and this reversal remain in the audit
            trail.
          </Alert>
          <Field label="Reason for reversal" required>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this payment is being corrected"
              autoFocus
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
