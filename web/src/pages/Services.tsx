import { useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, useApi } from '../api';
import { Alert, Badge, Card, Empty, ErrorNote, Field, Loading, Modal, PageHeader } from '../components/ui';
import { ghs, money, toPesewas } from '../format';

const EMPTY = { name: '', category: 'Consultation', price: '', description: '', active: true };

export default function Services() {
  const { data, loading, error, reload } = useApi<any>('/services?all=1');
  const meta = useApi<any>('/meta');
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const services = data?.services || [];
  const categories = meta.data?.service_categories || [];
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const s of services) {
      map[s.category] = map[s.category] || [];
      map[s.category].push(s);
    }
    return map;
  }, [services]);

  function openNew() {
    setForm(EMPTY);
    setEditing('new');
    setModalError(null);
  }

  function openEdit(service: any) {
    setForm({
      name: service.name,
      category: service.category,
      price: (service.price / 100).toFixed(2),
      description: service.description || '',
      active: !!service.active,
    });
    setEditing(service);
    setModalError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    if (!form.name.trim()) {
      setModalError('Enter the service name');
      return;
    }
    const price = toPesewas(form.price);
    if (Number.isNaN(price) || price < 0) {
      setModalError('Enter a valid price in Ghana Cedis');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        price,
        description: form.description,
        active: form.active,
      };
      if (editing === 'new') await api('/services', { method: 'POST', body });
      else await api(`/services/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      reload();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(service: any) {
    try {
      await api(`/services/${service.id}`, {
        method: 'PATCH',
        body: { active: !service.active },
      });
      reload();
    } catch (err: any) {
      setModalError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Services & prices"
        subtitle="All prices are in Ghana Cedis and feed directly into patient bills"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Add service
          </button>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {meta.error && <ErrorNote message={meta.error} />}

      {loading && !data ? (
        <Loading />
      ) : services.length === 0 ? (
        <Card>
          <Empty title="No services configured" note="Add consultation, nursing, laboratory and other charges." />
        </Card>
      ) : (
        <div className="stack">
          {Object.entries(grouped).map(([category, list]) => (
            <Card key={category} title={category} flush>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Description</th>
                      <th className="right">Price (GH₵)</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s: any) => (
                      <tr key={s.id}>
                        <td className="row-title">{s.name}</td>
                        <td className="small muted">{s.description || '—'}</td>
                        <td className="right mono">{money(s.price)}</td>
                        <td>
                          {s.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
                        </td>
                        <td className="right">
                          <div className="actions-cell">
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>
                              <Pencil size={13} /> Edit
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggle(s)}>
                              {s.active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        title={editing === 'new' ? 'Add service' : 'Edit service'}
        subtitle="Prices apply to future charges; existing bills keep the price recorded at the time"
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="service-form" disabled={busy}>
              {busy ? 'Saving…' : 'Save service'}
            </button>
          </>
        }
      >
        <form id="service-form" onSubmit={save} className="stack" style={{ gap: 14 }}>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <div className="form-grid">
            <Field label="Service name" required span={2}>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Malaria Rapid Test"
                autoFocus
              />
            </Field>
            <Field label="Category" required>
              <select
                className="select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {categories.map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Price (GH₵)" required>
              <input
                className="input"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Description" span={2}>
              <textarea
                className="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            {editing !== 'new' && (
              <Field label="Status" span={2}>
                <label className="row small">
                  <input
                    type="checkbox"
                    checked={!!form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Active — available when charging services
                </label>
              </Field>
            )}
          </div>
          {editing !== 'new' && editing && (
            <div className="faint tiny">Current price: {money(ghs(editing.price) * 100)}</div>
          )}
        </form>
      </Modal>
    </>
  );
}
