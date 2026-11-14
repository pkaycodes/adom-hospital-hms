import { useState } from 'react';
import { api } from '../api';
import { Alert, Field } from './ui';

export default function VitalsForm({
  visitId,
  initial,
  onSaved,
}: {
  visitId: number;
  initial?: any;
  onSaved: (detail: any) => void;
}) {
  const [form, setForm] = useState<any>({
    bp_systolic: initial?.bp_systolic ?? '',
    bp_diastolic: initial?.bp_diastolic ?? '',
    temperature: initial?.temperature ?? '',
    pulse: initial?.pulse ?? '',
    resp_rate: initial?.resp_rate ?? '',
    spo2: initial?.spo2 ?? '',
    weight: initial?.weight ?? '',
    height: initial?.height ?? '',
    glucose: initial?.glucose ?? '',
    complaints: initial?.complaints ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.complaints.trim()) {
      setError('Record the presenting complaints and symptoms');
      return;
    }
    setBusy(true);
    try {
      const data = await api<any>(`/visits/${visitId}/vitals`, { method: 'POST', body: form });
      onSaved(data);
    } catch (err: any) {
      setError(err.message || 'Could not save vital signs');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 13 }}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="form-grid cols-3">
        <Field label="Blood pressure (mmHg)">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              className="input"
              inputMode="numeric"
              placeholder="120"
              value={form.bp_systolic}
              onChange={set('bp_systolic')}
            />
            <span className="muted">/</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="80"
              value={form.bp_diastolic}
              onChange={set('bp_diastolic')}
            />
          </div>
        </Field>
        <Field label="Temperature (°C)">
          <input
            className="input"
            inputMode="decimal"
            placeholder="36.8"
            value={form.temperature}
            onChange={set('temperature')}
          />
        </Field>
        <Field label="Pulse rate (bpm)">
          <input className="input" inputMode="numeric" placeholder="76" value={form.pulse} onChange={set('pulse')} />
        </Field>
        <Field label="Respiratory rate (/min)">
          <input
            className="input"
            inputMode="numeric"
            placeholder="18"
            value={form.resp_rate}
            onChange={set('resp_rate')}
          />
        </Field>
        <Field label="Oxygen saturation SpO₂ (%)">
          <input className="input" inputMode="numeric" placeholder="98" value={form.spo2} onChange={set('spo2')} />
        </Field>
        <Field label="Blood glucose (mmol/L)" hint="Optional">
          <input
            className="input"
            inputMode="decimal"
            placeholder="5.4"
            value={form.glucose}
            onChange={set('glucose')}
          />
        </Field>
        <Field label="Weight (kg)">
          <input className="input" inputMode="decimal" placeholder="65" value={form.weight} onChange={set('weight')} />
        </Field>
        <Field label="Height (m)">
          <input className="input" inputMode="decimal" placeholder="1.68" value={form.height} onChange={set('height')} />
        </Field>
      </div>
      <Field label="Presenting complaints and symptoms" required>
        <textarea
          className="textarea"
          value={form.complaints}
          onChange={set('complaints')}
          placeholder="What the patient reports, onset, duration and any medication already taken…"
        />
      </Field>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Update vital signs' : 'Save and send to doctor'}
        </button>
      </div>
    </form>
  );
}
