import { db } from './db.js';

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (message, status = 400) => {
  throw new AppError(status, message);
};

export const nowIso = () => new Date().toISOString();

/** Africa/Accra is UTC+0 all year, so the UTC calendar date is the local date. */
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

export function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export const pad = (n, len) => String(n).padStart(len, '0');

export function nextSeq(key) {
  db.prepare('INSERT OR IGNORE INTO counters (key, value) VALUES (?, 0)').run(key);
  db.prepare('UPDATE counters SET value = value + 1 WHERE key = ?').run(key);
  return Number(db.prepare('SELECT value FROM counters WHERE key = ?').get(key).value);
}

export function patientNo() {
  return `GH-${pad(nextSeq(`patient:${new Date().getUTCFullYear()}`), 4)}`;
}

export function visitNo(date = new Date()) {
  const stamp = today(date).replaceAll('-', '');
  return `V-${stamp}-${pad(nextSeq(`visit:${stamp}`), 4)}`;
}

export function invoiceNo() {
  return `INV-${new Date().getUTCFullYear()}-${pad(nextSeq(`invoice:${new Date().getUTCFullYear()}`), 5)}`;
}

export function receiptNo() {
  return `RCPT-${new Date().getUTCFullYear()}-${pad(nextSeq(`receipt:${new Date().getUTCFullYear()}`), 5)}`;
}

export function audit(staff, action, entity, entityId, details) {
  db.prepare(
    `INSERT INTO audit_logs (staff_id, staff_name, action, entity, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    staff?.id ?? null,
    staff?.full_name ?? 'System',
    action,
    entity ?? null,
    entityId ?? null,
    details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
    nowIso(),
  );
}

export function invoiceTotals(invoiceId) {
  const total = Number(
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS t FROM invoice_items WHERE invoice_id = ? AND status = 'active'`,
      )
      .get(invoiceId).t,
  );
  const paid = Number(
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS t FROM payments WHERE invoice_id = ? AND status = 'confirmed'`,
      )
      .get(invoiceId).t,
  );
  return { total, paid, balance: Math.max(total - paid, 0) };
}

export function recalcInvoice(invoiceId) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;
  const totals = invoiceTotals(invoiceId);
  let status = invoice.status;
  if (status !== 'cancelled') {
    if (totals.paid > 0 && totals.paid < totals.total) status = 'partial';
    else if (totals.total > 0 && totals.paid >= totals.total) status = 'paid';
    else if (totals.paid > 0) status = 'paid';
    else status = 'open';
  }
  db.prepare('UPDATE invoices SET total = ?, status = ?, updated_at = ? WHERE id = ?').run(
    totals.total,
    status,
    nowIso(),
    invoiceId,
  );
  return { ...totals, status };
}

/** Add a billable line item. Source type keeps the audit link to care activity. */
export function addInvoiceItem({
  invoiceId,
  serviceId = null,
  description,
  category,
  unitPrice,
  quantity = 1,
  sourceType = 'manual',
  sourceId = null,
  staffId = null,
}) {
  const qty = Math.max(1, Number(quantity) || 1);
  const price = Math.max(0, Math.round(Number(unitPrice) || 0));
  const amount = price * qty;
  const info = db
    .prepare(
      `INSERT INTO invoice_items
       (invoice_id, service_id, description, category, unit_price, quantity, amount, source_type, source_id, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      invoiceId,
      serviceId,
      description,
      category || 'Other',
      price,
      qty,
      amount,
      sourceType,
      sourceId,
      staffId,
      nowIso(),
    );
  recalcInvoice(invoiceId);
  return Number(info.lastInsertRowid);
}

export function visitPendingCounts(visitId) {
  const labs = Number(
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM lab_requests WHERE visit_id = ? AND status IN ('pending','in_progress')`,
      )
      .get(visitId).c,
  );
  const rx = Number(
    db.prepare(`SELECT COUNT(*) AS c FROM prescriptions WHERE visit_id = ? AND status = 'pending'`).get(visitId).c,
  );
  return { labs, rx };
}

/**
 * Moves a visit to the correct queue once the consultation is complete.
 * Clinical queues (nursing/doctor/consulting) are controlled by staff actions.
 */
export function advanceVisit(visitId) {
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
  if (!visit) return;
  if (['cancelled', 'completed'].includes(visit.status)) return;
  if (!visit.consultation_completed) return;

  const { labs, rx } = visitPendingCounts(visitId);
  const invoice = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(visitId);
  const totals = invoice ? invoiceTotals(invoice.id) : { balance: 0 };
  let status = 'completed';
  if (labs > 0) status = 'awaiting_lab';
  else if (rx > 0) status = 'awaiting_pharmacy';
  else if (totals.balance > 0) status = 'awaiting_payment';

  db.prepare('UPDATE visits SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?').run(
    status,
    nowIso(),
    status === 'completed' ? nowIso() : null,
    visitId,
  );
}

export function requireFields(body, fields) {
  for (const field of fields) {
    const value = body?.[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      fail(`${field.replaceAll('_', ' ')} is required`);
    }
  }
}

export function cleanPhone(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const phone = String(value).replace(/[\s-]/g, '');
  if (!/^(\+233\d{9}|0\d{9})$/.test(phone)) {
    fail('Enter a valid Ghanaian phone number (e.g. 024 123 4567 or +233241234567)');
  }
  return phone;
}

export function cleanDate(value, label = 'date') {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || date.length !== 10) fail(`Enter a valid ${label}`);
  return date;
}

export function int(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function num(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(`${String(dob).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}
