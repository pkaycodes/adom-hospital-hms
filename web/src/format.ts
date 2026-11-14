export const money = (pesewas: number | null | undefined) =>
  `GH₵ ${((pesewas || 0) / 100).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const ghs = (pesewas: number | null | undefined) => (pesewas || 0) / 100;

export const toPesewas = (value: string | number) => Math.round(Number(value || 0) * 100);

export const dateTime = (iso?: string | null) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

export const dateOnly = (iso?: string | null) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
};

export const shortDate = (iso?: string | null) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    day: '2-digit',
    month: 'short',
  }).format(new Date(iso));
};

export const timeOnly = (iso?: string | null) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

export const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const ageText = (age: number | null | undefined, dob?: string | null) => {
  if (age === null || age === undefined) return dob ? '—' : '—';
  return `${age} yr${age === 1 ? '' : 's'}`;
};

export const initials = (name?: string | null) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export type Tone = 'teal' | 'amber' | 'blue' | 'green' | 'red' | 'gray' | 'violet';

export const VISIT_STATUS: Record<string, { label: string; tone: Tone }> = {
  awaiting_nursing: { label: 'Waiting for nursing', tone: 'amber' },
  awaiting_doctor: { label: 'Waiting for doctor', tone: 'blue' },
  consulting: { label: 'In consultation', tone: 'violet' },
  awaiting_lab: { label: 'At laboratory', tone: 'blue' },
  awaiting_pharmacy: { label: 'At pharmacy', tone: 'violet' },
  awaiting_payment: { label: 'Awaiting payment', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const LAB_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  in_progress: { label: 'In progress', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const RX_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  dispensed: { label: 'Dispensed', tone: 'green' },
  unavailable: { label: 'Unavailable', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Unpaid', tone: 'amber' },
  partial: { label: 'Part paid', tone: 'blue' },
  paid: { label: 'Settled', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const paymentMethod = (method: string) => (method === 'momo' ? 'Mobile Money' : 'Cash');

export const waitedFor = (iso?: string | null) => {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};
