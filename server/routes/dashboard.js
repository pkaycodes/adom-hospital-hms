import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requirePerm } from '../auth.js';
import { today } from '../util.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePerm('dashboard.view'), (req, res, next) => {
  try {
    const day = today();
    const dayStart = `${day}T00:00:00.000Z`;
    const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();
    const count = (sql, ...params) => Number(db.prepare(sql).get(...params).c);

    const stats = {
      total_patients: count('SELECT COUNT(*) AS c FROM patients WHERE archived = 0'),
      new_patients_today: count('SELECT COUNT(*) AS c FROM patients WHERE date(created_at) = ?', day),
      active_visits: count("SELECT COUNT(*) AS c FROM visits WHERE status NOT IN ('completed','cancelled')"),
      awaiting_nursing: count("SELECT COUNT(*) AS c FROM visits WHERE status = 'awaiting_nursing'"),
      awaiting_doctor: count("SELECT COUNT(*) AS c FROM visits WHERE status = 'awaiting_doctor'"),
      consulting: count("SELECT COUNT(*) AS c FROM visits WHERE status = 'consulting'"),
      completed_today: count("SELECT COUNT(*) AS c FROM visits WHERE status = 'completed' AND closed_at >= ?", dayStart),
      pending_labs: count(
        "SELECT COUNT(*) AS c FROM lab_requests WHERE status IN ('pending','in_progress')",
      ),
      pending_rx: count("SELECT COUNT(*) AS c FROM prescriptions WHERE status = 'pending'"),
      awaiting_payment: count("SELECT COUNT(*) AS c FROM visits WHERE status = 'awaiting_payment'"),
      outstanding_total: Number(
        db
          .prepare(
            `SELECT COALESCE(SUM(bal),0) AS c FROM (
               SELECT (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active')
                 - (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS bal
               FROM invoices i WHERE i.status <> 'cancelled'
             ) WHERE bal > 0`,
          )
          .get().c,
      ),
      low_stock: count('SELECT COUNT(*) AS c FROM medications WHERE active = 1 AND stock_qty <= reorder_level'),
    };

    const revenue = db
      .prepare(
        `SELECT method, COALESCE(SUM(amount),0) AS total FROM payments
         WHERE status = 'confirmed' AND paid_at >= ? AND paid_at < ? GROUP BY method`,
      )
      .all(dayStart, dayEnd);
    stats.today_revenue = revenue.reduce((sum, r) => sum + r.total, 0);
    stats.today_revenue_split = { cash: 0, momo: 0 };
    for (const r of revenue) stats.today_revenue_split[r.method] = r.total;

    const queue = (statuses) =>
      db
        .prepare(
          `SELECT v.id, v.visit_no, v.reason, v.status, v.created_at, p.patient_no, p.full_name AS patient_name,
                  p.gender, p.date_of_birth, d.full_name AS doctor_name,
                  EXISTS(SELECT 1 FROM vitals vt WHERE vt.visit_id = v.id) AS vitals_done,
                  (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                     WHERE i.visit_id = v.id AND ii.status='active') AS billed,
                  (SELECT COALESCE(SUM(pay.amount),0) FROM payments pay JOIN invoices i ON i.id = pay.invoice_id
                     WHERE i.visit_id = v.id AND pay.status='confirmed') AS paid
           FROM visits v JOIN patients p ON p.id = v.patient_id
           LEFT JOIN staff d ON d.id = v.doctor_id
           WHERE v.status IN (${statuses.map(() => '?').join(',')})
           ORDER BY v.created_at ASC LIMIT 8`,
        )
        .all(...statuses);

    const labs = db
      .prepare(
        `SELECT l.id, l.test_name, l.status, l.requested_at, p.full_name AS patient_name, p.patient_no, v.visit_no
         FROM lab_requests l JOIN patients p ON p.id = l.patient_id JOIN visits v ON v.id = l.visit_id
         WHERE l.status IN ('pending','in_progress') ORDER BY l.requested_at ASC LIMIT 8`,
      )
      .all();

    const prescriptions = db
      .prepare(
        `SELECT rx.id, rx.drug_name, rx.quantity, rx.prescribed_at, p.full_name AS patient_name,
                p.patient_no, v.visit_no
         FROM prescriptions rx JOIN patients p ON p.id = rx.patient_id JOIN visits v ON v.id = rx.visit_id
         WHERE rx.status = 'pending' ORDER BY rx.prescribed_at ASC LIMIT 8`,
      )
      .all();

    const payments = db
      .prepare(
        `SELECT pay.id, pay.receipt_no, pay.amount, pay.method, pay.paid_at, p.full_name AS patient_name,
                s.full_name AS cashier_name
         FROM payments pay JOIN patients p ON p.id = pay.patient_id
         LEFT JOIN staff s ON s.id = pay.received_by
         WHERE pay.status = 'confirmed' AND pay.paid_at >= ? AND pay.paid_at < ?
         ORDER BY pay.paid_at DESC LIMIT 6`,
      )
      .all(dayStart, dayEnd);

    const lowStock = db
      .prepare(
        `SELECT id, name, form, strength, stock_qty, reorder_level FROM medications
         WHERE active = 1 AND stock_qty <= reorder_level ORDER BY stock_qty LIMIT 6`,
      )
      .all();

    res.json({
      stats,
      queues: {
        nursing: queue(['awaiting_nursing']),
        doctor: queue(['awaiting_doctor', 'consulting']),
        awaiting_payment: queue(['awaiting_payment']),
      },
      labs,
      prescriptions,
      payments,
      low_stock: lowStock,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
