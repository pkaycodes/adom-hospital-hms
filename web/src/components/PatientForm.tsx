import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alert, Field, Modal } from './ui';

const EMPTY = {
  full_name: '',
  date_of_birth: '',
  gender: 'female',
  phone: '',
  address: '',
  emergency_name: '',
  emergency_phone: '',
  ghana_card: '',
  nhis_number: '',
  nhis_status: 'none',
  allergies: '',
  conditions: '',
  notes: '',
};

export default function PatientFormModal({
  open,
  patient,
  onClose,
  onSaved,
}: {
  open: boolean;
  patient?: any;
  onClose: () => void;
  onSaved: (patient: any) => void;
}) {
  const [form, setForm] = useState<any>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (patient) {
      setForm({
        full_name: patient.full_name || '',
        date_of_birth: patient.date_of_birth || '',
        gender: patient.gender || 'female',
        phone: patient.phone || '',
        address: patient.address || '',
        emergency_name: patient.emergency_name || '',
        emergency_phone: patient.emergency_phone || '',
        ghana_card: patient.ghana_card || '',
        nhis_number: patient.nhis_number || '',
        nhis_status: patient.nhis_status || 'none',
        allergies: patient.allergies || '',
        conditions: patient.conditions || '',
        notes: patient.notes || '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, patient]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) {
      setError('Enter the patient’s full name');
      return;
    }
    setBusy(true);
    try {
      const data = patient
        ? await api<any>(`/patients/${patient.id}`, { method: 'PATCH', body: form })
        : await api<any>('/patients', { method: 'POST', body: form });
      onSaved(data.patient || data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save the patient');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={patient ? 'Edit patient record' : 'Register a new patient'}
      subtitle={
        patient
          ? `Patient ID ${patient.patient_no} — changes are recorded in the audit log`
          : 'A permanent patient ID and medical record will be created'
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="patient-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : patient ? 'Save changes' : 'Register patient'}
          </button>
        </>
      }
    >
      <form id="patient-form" onSubmit={submit} className="stack" style={{ gap: 14 }}>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <Field label="Full name" required span={2}>
            <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="e.g. Ama Serwaa" />
          </Field>
          <Field label="Date of birth">
            <input type="date" className="input" value={form.date_of_birth} onChange={set('date_of_birth')} />
          </Field>
          <Field label="Gender" required>
            <select className="select" value={form.gender} onChange={set('gender')}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Phone number" hint="Ghana format, e.g. 024 123 4567">
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="024 123 4567" />
          </Field>
          <Field label="Emergency contact name">
            <input className="input" value={form.emergency_name} onChange={set('emergency_name')} />
          </Field>
          <Field label="Emergency contact phone">
            <input className="input" value={form.emergency_phone} onChange={set('emergency_phone')} />
          </Field>
          <Field label="Ghana Card number" hint="Optional">
            <input className="input" value={form.ghana_card} onChange={set('ghana_card')} placeholder="GHA-000000000-0" />
          </Field>
          <Field label="NHIS membership number">
            <input className="input" value={form.nhis_number} onChange={set('nhis_number')} />
          </Field>
          <Field label="NHIS status">
            <select className="select" value={form.nhis_status} onChange={set('nhis_status')}>
              <option value="none">No NHIS</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </Field>
          <Field label="Residential address" span={2}>
            <input className="input" value={form.address} onChange={set('address')} placeholder="House / street / town" />
          </Field>
          <Field label="Known allergies" hint="Medication, food or other allergies">
            <textarea className="textarea" value={form.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin" />
          </Field>
          <Field label="Existing medical conditions">
            <textarea
              className="textarea"
              value={form.conditions}
              onChange={set('conditions')}
              placeholder="e.g. Hypertension, diabetes, asthma"
            />
          </Field>
          <Field label="Other relevant notes" span={2}>
            <textarea className="textarea" value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
