import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin, requireAuth, requirePerm } from '../auth.js';
import { hasPermission } from '../permissions.js';
import {
  addInvoiceItem,
  addDays,
  advanceVisit,
  audit,
  fail,
  int,
  invoiceTotals,
  nowIso,
  recalcInvoice,
  receiptNo,
  today,
} from '../util.js';

const router = Router();
router.use(requireAuth);

const money = (pesewas) => `GH₵ ${(pesewas / 100).toFixed(2)}`;

export function invoiceDetail(id) {
  const invoice = db
    .prepare(
      `SELECT i.*, p.full_name AS patient_name, p.patient_no, p.phone AS patient_phone,
              v.visit_no, v.status AS visit_status, v.id AS visit_id
       FROM invoices i JOIN patients p ON p.id = i.patient_id
       JOIN visits v ON v.id = i.visit_id WHERE i.id = ?`,
    )
    .get(id);
  if (!invoice) return null;
  const items = db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at, id')
    .all(id);
  const payments = db
    .prepare(
      `SELECT pay.*, s.full_name AS cashier_name FROM payments pay
       LEFT JOIN staff s ON s.id = pay.received_by
       WHERE pay.invoice_id = ? ORDER BY pay.paid_at`,
    )
    .all(id);
  return { ...invoice, ...invoiceTotals(id), items, payments };
}

router.get('/invoices', requirePerm('billing.view'), (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT i.*, p.full_name AS patient_name, p.patient_no, p.phone,
                v.visit_no, v.status AS visit_status,
                (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active') AS billed,
                (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS paid_amount,
                (SELECT COUNT(*) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS payment_count
         FROM invoices i JOIN patients p ON p.id = i.patient_id
         JOIN visits v ON v.id = i.visit_id
         WHERE (? = '' OR p.full_name LIKE ? OR p.patient_no LIKE ? OR i.invoice_no LIKE ? OR p.phone LIKE ?)
         ORDER BY i.created_at DESC LIMIT 400`,
      )
      .all(q, like, like, like, like);

    let list = rows.map((r) => ({
      ...r,
      balance: Math.max((r.billed || 0) - (r.paid_amount || 0), 0),
    }));
    const filter = String(req.query.filter || 'unpaid');
    if (filter === 'unpaid') list = list.filter((r) => r.balance > 0 && r.status !== 'cancelled');
    else if (filter === 'settled') list = list.filter((r) => r.balance === 0 && (r.billed || 0) > 0);
    else if (filter === 'today') list = list.filter((r) => r.created_at.slice(0, 10) === today());
    res.json({ invoices: list.slice(0, 200) });
  } catch (err) {
    next(err);
  }
});

router.get('/invoices/:id', requirePerm('billing.view'), (req, res, next) => {
  try {
    const detail = invoiceDetail(Number(req.params.id));
    if (!detail) fail('Invoice not found', 404);
    res.json({ invoice: detail });
  } catch (err) {
    next(err);
  }
});

router.post('/invoices/:id/items', requirePerm('billing.manage'), (req, res, next) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
    if (!invoice) fail('Invoice not found', 404);
    if (invoice.status === 'cancelled') fail('This invoice has been cancelled');
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(Number(req.body?.service_id));
    if (!service) fail('Select a service');
    if (!service.active) fail('This service is inactive');
    const quantity = Math.max(1, int(req.body?.quantity, 1));
    addInvoiceItem({
      invoiceId: invoice.id,
      serviceId: service.id,
      description: service.name,
      category: service.category,
      unitPrice: service.price,
      quantity,
      sourceType: 'manual',
      staffId: req.staff.id,
    });
    advanceVisit(invoice.visit_id);
    audit(req.staff, 'Added service to bill', 'invoice', invoice.id, `${service.name} × ${quantity}`);
    res.status(201).json({ invoice: invoiceDetail(invoice.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/invoices/:id/payments', requirePerm('payments.manage'), (req, res, next) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
    if (!invoice) fail('Invoice not found', 404);
    if (invoice.status === 'cancelled') fail('This invoice has been cancelled');
    const totals = invoiceTotals(invoice.id);
    if (totals.total === 0) fail('No services have been billed on this visit yet');
    const amount = int(req.body?.amount);
    if (!amount || amount <= 0) fail('Enter the amount received');
    if (amount > totals.balance) {
      fail(`Amount received (${money(amount)}) is more than the outstanding balance of ${money(totals.balance)}`);
    }
    const method = String(req.body?.method || '').toLowerCase();
    if (!['cash', 'momo'].includes(method)) fail('Select Cash or Mobile Money as the payment method');
    const reference = req.body?.momo_reference ? String(req.body.momo_reference).trim() : null;
    if (reference && reference.length > 60) fail('Mobile Money reference is too long');
    let paidAt = nowIso();
    if (req.body?.paid_at) {
      const parsed = new Date(req.body.paid_at);
      if (Number.isNaN(parsed.getTime())) fail('Enter a valid payment date and time');
      if (parsed.getTime() > Date.now() + 5 * 60 * 1000) fail('Payment time cannot be in the future');
      paidAt = parsed.toISOString();
    }
    const duplicate = db
      .prepare(
        `SELECT id FROM payments WHERE invoice_id = ? AND amount = ? AND method = ? AND received_by = ?
         AND status = 'confirmed' AND created_at > ?`,
      )
      .get(invoice.id, amount, method, req.staff.id, new Date(Date.now() - 10000).toISOString());
    if (duplicate) fail('An identical payment was just recorded. Check the payment history.');

    const rNo = receiptNo();
    const info = db
      .prepare(
        `INSERT INTO payments (receipt_no, invoice_id, patient_id, amount, method, momo_reference, received_by,
          paid_at, notes, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
      )
      .run(
        rNo,
        invoice.id,
        invoice.patient_id,
        amount,
        method,
        reference,
        req.staff.id,
        paidAt,
        req.body?.notes ? String(req.body.notes).trim() : null,
        nowIso(),
      );
    recalcInvoice(invoice.id);
    advanceVisit(invoice.visit_id);
    audit(
      req.staff,
      'Recorded payment',
      'payment',
      Number(info.lastInsertRowid),
      `${rNo} ${money(amount)} ${method === 'cash' ? 'cash' : 'MoMo'} for ${invoice.invoice_no}`,
    );
    res.status(201).json({
      payment: db
        .prepare('SELECT * FROM payments WHERE id = ?')
        .get(Number(info.lastInsertRowid)),
      invoice: invoiceDetail(invoice.id),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/payments/:id/reverse', requireAdmin, (req, res, next) => {
  try {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
    if (!payment) fail('Payment not found', 404);
    if (payment.status !== 'confirmed') fail('This payment has already been reversed');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) fail('Give a reason for reversing this payment');
    db.prepare(
      "UPDATE payments SET status = 'reversed', reversed_by = ?, reversed_at = ?, reversal_reason = ? WHERE id = ?",
    ).run(req.staff.id, nowIso(), reason, payment.id);
    recalcInvoice(payment.invoice_id);
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(payment.invoice_id);
    advanceVisit(invoice.visit_id);
    audit(
      req.staff,
      'Reversed payment',
      'payment',
      payment.id,
      `${payment.receipt_no} ${money(payment.amount)} — ${reason}`,
    );
    res.json({ invoice: invoiceDetail(payment.invoice_id) });
  } catch (err) {
    next(err);
  }
});

function canViewPayments(staff) {
  return (
    hasPermission(staff.role, 'payments.manage') ||
    hasPermission(staff.role, 'finance.view') ||
    hasPermission(staff.role, 'billing.view')
  );
}

router.get('/payments', (req, res, next) => {
  try {
    if (!canViewPayments(req.staff)) fail('Your role does not allow this action', 403);
    const clauses = [];
    const params = [];
    const from = req.query.from ? String(req.query.from).slice(0, 10) : null;
    const to = req.query.to ? String(req.query.to).slice(0, 10) : null;
    if (from) {
      clauses.push('pay.paid_at >= ?');
      params.push(`${from}T00:00:00.000Z`);
    }
    if (to) {
      clauses.push('pay.paid_at < ?');
      params.push(addDays(`${to}T00:00:00.000Z`, 1));
    }
    if (req.query.method) {
      clauses.push('pay.method = ?');
      params.push(String(req.query.method));
    }
    if (req.query.cashier_id) {
      clauses.push('pay.received_by = ?');
      params.push(Number(req.query.cashier_id));
    }
    if (req.query.patient_id) {
      clauses.push('pay.patient_id = ?');
      params.push(Number(req.query.patient_id));
    }
    if (req.query.status) {
      clauses.push('pay.status = ?');
      params.push(String(req.query.status));
    }
    const q = String(req.query.q || '').trim();
    if (q) {
      clauses.push('(p.full_name LIKE ? OR p.patient_no LIKE ? OR pay.receipt_no LIKE ? OR pay.momo_reference LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT pay.*, p.full_name AS patient_name, p.patient_no, s.full_name AS cashier_name,
                i.invoice_no, v.visit_no, r.full_name AS reversed_by_name
         FROM payments pay JOIN patients p ON p.id = pay.patient_id
         JOIN invoices i ON i.id = pay.invoice_id
         JOIN visits v ON v.id = i.visit_id
         LEFT JOIN staff s ON s.id = pay.received_by
         LEFT JOIN staff r ON r.id = pay.reversed_by
         ${where} ORDER BY pay.paid_at DESC LIMIT 500`,
      )
      .all(...params);
    res.json({ payments: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/finance/summary', requirePerm('finance.view'), (req, res, next) => {
  try {
    const from = String(req.query.from || today()).slice(0, 10);
    const to = String(req.query.to || today()).slice(0, 10);
    const start = `${from}T00:00:00.000Z`;
    const end = addDays(`${to}T00:00:00.000Z`, 1);
    const day = today();
    const monthStart = `${day.slice(0, 7)}-01T00:00:00.000Z`;
    const weekStart = addDays(`${day}T00:00:00.000Z`, -6);

    const sumPayments = (a, b) =>
      db
        .prepare(
          `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM payments
           WHERE status='confirmed' AND paid_at >= ? AND paid_at < ?`,
        )
        .get(a, b);

    const range = sumPayments(start, end);
    const byMethod = db
      .prepare(
        `SELECT method, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM payments
         WHERE status='confirmed' AND paid_at >= ? AND paid_at < ? GROUP BY method`,
      )
      .all(start, end);
    const todayTotals = sumPayments(`${day}T00:00:00.000Z`, addDays(`${day}T00:00:00.000Z`, 1));
    const week = sumPayments(weekStart, addDays(`${day}T00:00:00.000Z`, 1));
    const month = sumPayments(monthStart, addDays(`${day}T00:00:00.000Z`, 1));

    const billedInRange = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS total FROM invoice_items
         WHERE status='active' AND created_at >= ? AND created_at < ?`,
      )
      .get(start, end);

    const outstandingRow = db
      .prepare(
        `SELECT COALESCE(SUM(bal),0) AS total, COUNT(*) AS count FROM (
           SELECT (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active')
             - (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS bal
           FROM invoices i WHERE i.status <> 'cancelled'
         ) WHERE bal > 0`,
      )
      .get();

    const categories = db
      .prepare(
        `SELECT category, COALESCE(SUM(amount),0) AS total, COALESCE(SUM(quantity),0) AS quantity
         FROM invoice_items WHERE status='active' AND created_at >= ? AND created_at < ?
         GROUP BY category ORDER BY total DESC`,
      )
      .all(start, end);

    const trend = db
      .prepare(
        `SELECT substr(paid_at, 1, 10) AS day, method, COALESCE(SUM(amount),0) AS total
         FROM payments WHERE status='confirmed' AND paid_at >= ?
         GROUP BY day, method ORDER BY day`,
      )
      .all(addDays(`${day}T00:00:00.000Z`, -6));

    const topOutstanding = db
      .prepare(
        `SELECT p.id, p.full_name, p.patient_no, SUM(bal) AS balance, COUNT(*) AS invoices FROM (
           SELECT i.id, i.patient_id,
             (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active')
             - (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS bal
           FROM invoices i WHERE i.status <> 'cancelled'
         ) x JOIN patients p ON p.id = x.patient_id WHERE x.bal > 0
         GROUP BY p.id ORDER BY balance DESC LIMIT 8`,
      )
      .all();

    const cashierBreakdown = db
      .prepare(
        `SELECT s.id, s.full_name, COALESCE(SUM(pay.amount),0) AS total, COUNT(pay.id) AS count,
                SUM(CASE WHEN pay.method='cash' THEN pay.amount ELSE 0 END) AS cash_total,
                SUM(CASE WHEN pay.method='momo' THEN pay.amount ELSE 0 END) AS momo_total
         FROM payments pay LEFT JOIN staff s ON s.id = pay.received_by
         WHERE pay.status='confirmed' AND pay.paid_at >= ? AND pay.paid_at < ?
         GROUP BY s.id ORDER BY total DESC`,
      )
      .all(start, end);

    res.json({
      range: { from, to },
      collections: {
        total: range.total,
        count: range.count,
        by_method: byMethod,
        today: todayTotals.total,
        week: week.total,
        month: month.total,
      },
      bills_generated: billedInRange.total,
      outstanding: { total: outstandingRow.total, invoices: outstandingRow.count },
      by_category: categories,
      trend,
      top_outstanding: topOutstanding,
      by_cashier: cashierBreakdown,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
