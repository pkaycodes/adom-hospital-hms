import { useState } from 'react';
import { Package, PackagePlus, Pencil, Plus } from 'lucide-react';
import { api, useApi } from '../api';
import { Alert, Badge, Card, ErrorNote, Field, Loading, Modal, PageHeader } from '../components/ui';
import { money, toPesewas } from '../format';

const EMPTY = {
  name: '',
  form: 'Tablet',
  strength: '',
  unit_price: '',
  stock_qty: 0,
  reorder_level: 10,
  active: true,
};

export default function Medications() {
  const { data, loading, error, reload } = useApi<any>('/pharmacy/inventory/list');
  const [mode, setMode] = useState<'new' | 'edit' | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [restockFor, setRestockFor] = useState<any>(null);
  const [restockQty, setRestockQty] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const meds = data?.medications || [];
  const lowStock = meds.filter((m: any) => m.active && m.stock_qty <= m.reorder_level);

  function openNew() {
    setForm(EMPTY);
    setMode('new');
    setEditing(null);
    setModalError(null);
  }

  function openEdit(med: any) {
    setForm({
      name: med.name,
      form: med.form || '',
      strength: med.strength || '',
      unit_price: (med.unit_price / 100).toFixed(2),
      stock_qty: med.stock_qty,
      reorder_level: med.reorder_level,
      active: !!med.active,
    });
    setMode('edit');
    setEditing(med);
    setModalError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (!form.name.trim()) {
      setModalError('Enter the medication name');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        form: form.form,
        strength: form.strength,
        unit_price: toPesewas(form.unit_price),
        stock_qty: Number(form.stock_qty) || 0,
        reorder_level: Number(form.reorder_level) || 0,
        active: form.active,
      };
      if (mode === 'new') await api('/pharmacy/inventory/list', { method: 'POST', body });
      else await api(`/pharmacy/inventory/list/${editing.id}`, { method: 'PATCH', body });
      setMode(null);
      reload();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function restock(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    const qty = Number(restockQty);
    if (!qty || qty <= 0) {
      setModalError('Enter a quantity greater than zero');
      return;
    }
    setBusy(true);
    try {
      await api(`/pharmacy/inventory/list/${restockFor.id}/restock`, {
        method: 'POST',
        body: { quantity: qty },
      });
      setRestockFor(null);
      setRestockQty('');
      reload();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Medicine inventory"
        subtitle="Stock is deducted when the pharmacy dispenses; prices feed the patient bill"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Add medication
          </button>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}

      {lowStock.length > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: 14 }}>
          <Package size={15} />
          <div>
            <strong>{lowStock.length} medication(s) at or below reorder level.</strong> Restock soon to avoid
            unavailable prescriptions.
          </div>
        </div>
      )}

      <Card flush>
        {loading && !data ? (
          <Loading />
        ) : meds.length === 0 ? (
          <div className="empty"><h3>No medications in inventory</h3></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Form / strength</th>
                  <th className="right">Unit price</th>
                  <th className="right">Stock</th>
                  <th className="right">Reorder level</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meds.map((m: any) => {
                  const low = m.active && m.stock_qty <= m.reorder_level;
                  return (
                    <tr key={m.id}>
                      <td className="row-title">{m.name}</td>
                      <td className="small muted">{[m.form, m.strength].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="right mono small">{money(m.unit_price)}</td>
                      <td className="right mono" style={{ fontWeight: 650, color: low ? 'var(--danger)' : undefined }}>
                        {m.stock_qty}
                      </td>
                      <td className="right mono small muted">{m.reorder_level}</td>
                      <td>
                        {!m.active ? (
                          <Badge tone="gray">Inactive</Badge>
                        ) : m.stock_qty === 0 ? (
                          <Badge tone="red">Out of stock</Badge>
                        ) : low ? (
                          <Badge tone="amber">Low stock</Badge>
                        ) : (
                          <Badge tone="green">In stock</Badge>
                        )}
                      </td>
                      <td className="right">
                        <div className="actions-cell">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setRestockFor(m);
                              setRestockQty('');
                              setModalError(null);
                            }}
                          >
                            <PackagePlus size={13} /> Restock
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>
                            <Pencil size={13} /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!mode}
        title={mode === 'new' ? 'Add medication' : 'Edit medication'}
        onClose={() => setMode(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="med-form" disabled={busy}>
              {busy ? 'Saving…' : 'Save medication'}
            </button>
          </>
        }
      >
        <form id="med-form" onSubmit={save} className="stack" style={{ gap: 14 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <div className="form-grid">
            <Field label="Medication name" required span={2}>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Form">
              <select className="select" value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })}>
                {['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Infusion', 'Sachet', 'Cream', 'Inhaler', 'Drops'].map(
                  (f) => (
                    <option key={f} value={f}>{f}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Strength">
              <input
                className="input"
                value={form.strength}
                onChange={(e) => setForm({ ...form, strength: e.target.value })}
                placeholder="e.g. 500mg"
              />
            </Field>
            <Field label="Unit price (GH₵)" required>
              <input
                className="input"
                inputMode="decimal"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Stock quantity">
              <input
                className="input"
                type="number"
                min={0}
                value={form.stock_qty}
                onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
              />
            </Field>
            <Field label="Reorder level">
              <input
                className="input"
                type="number"
                min={0}
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </Field>
            {mode === 'edit' && (
              <Field label="Status" span={2}>
                <label className="row small">
                  <input
                    type="checkbox"
                    checked={!!form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Active — available for prescribing and dispensing
                </label>
              </Field>
            )}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!restockFor}
        title="Restock medication"
        subtitle={restockFor ? `${restockFor.name} · current stock ${restockFor.stock_qty}` : ''}
        onClose={() => setRestockFor(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRestockFor(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="restock-form" disabled={busy}>
              {busy ? 'Adding…' : 'Add stock'}
            </button>
          </>
        }
      >
        <form id="restock-form" onSubmit={restock} className="stack" style={{ gap: 12 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <Field label="Quantity received" required>
            <input
              className="input"
              type="number"
              min={1}
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="alert alert-info">
            <PackagePlus size={15} />
            <div>The quantity is added to the current stock and recorded in the audit log.</div>
          </div>
        </form>
      </Modal>
    </>
  );
}
