import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requirePerm } from '../auth.js';
import { hasPermission } from '../permissions.js';
import { addInvoiceItem, advanceVisit, audit, fail, int, nowIso, recalcInvoice } from '../util.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePerm('prescriptions.dispense'), (req, res, next) => {
  try {
    const status = String(req.query.status || 'pending');
    const rows = db
      .prepare(
        `SELECT rx.*, p.full_name AS patient_name, p.patient_no, p.gender, p.date_of_birth, p.allergies,
                v.visit_no, s.full_name AS prescribed_by_name, d.full_name AS dispensed_by_name,
                m.stock_qty AS stock_qty, m.form AS form, m.strength AS strength
         FROM prescriptions rx
         JOIN patients p ON p.id = rx.patient_id
         JOIN visits v ON v.id = rx.visit_id
         LEFT JOIN staff s ON s.id = rx.prescribed_by
         LEFT JOIN staff d ON d.id = rx.dispensed_by
         LEFT JOIN medications m ON m.id = rx.medication_id
         WHERE rx.status = ?
         ORDER BY rx.prescribed_at DESC LIMIT 200`,
      )
      .all(status);
    res.json({ prescriptions: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/dispense', requirePerm('prescriptions.dispense'), (req, res, next) => {
  try {
    const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(Number(req.params.id));
    if (!rx) fail('Prescription not found', 404);
    if (rx.status !== 'pending') fail('This prescription has already been handled');
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(rx.visit_id);
    if (!visit) fail('Visit not found', 404);
    const med = rx.medication_id
      ? db.prepare('SELECT * FROM medications WHERE id = ?').get(rx.medication_id)
      : null;
    if (med) {
      if (med.stock_qty < rx.quantity) {
        fail(`Insufficient stock for ${med.name}. Available: ${med.stock_qty}, required: ${rx.quantity}`);
      }
      db.prepare('UPDATE medications SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ?').run(
        rx.quantity,
        nowIso(),
        med.id,
      );
    }
    const invoice = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(rx.visit_id);
    let itemId = null;
    if (invoice && rx.price > 0) {
      itemId = addInvoiceItem({
        invoiceId: invoice.id,
        serviceId: null,
        description: `${rx.drug_name} × ${rx.quantity}${med?.strength ? ` (${med.strength})` : ''}`,
        category: 'Pharmacy',
        unitPrice: rx.price,
        quantity: rx.quantity,
        sourceType: 'pharmacy',
        sourceId: rx.id,
        staffId: req.staff.id,
      });
    }
    db.prepare(
      `UPDATE prescriptions SET status = 'dispensed', dispensed_by = ?, dispensed_at = ?, invoice_item_id = ? WHERE id = ?`,
    ).run(req.staff.id, nowIso(), itemId, rx.id);
    advanceVisit(rx.visit_id);
    audit(req.staff, 'Dispensed medication', 'prescription', rx.id, `${rx.drug_name} × ${rx.quantity}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/unavailable', requirePerm('prescriptions.dispense'), (req, res, next) => {
  try {
    const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(Number(req.params.id));
    if (!rx) fail('Prescription not found', 404);
    if (rx.status !== 'pending') fail('This prescription has already been handled');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) fail('State why the medication cannot be dispensed');
    db.prepare(
      "UPDATE prescriptions SET status = 'unavailable', instructions = COALESCE(instructions,'') || ' | Pharmacy: ' || ? WHERE id = ?",
    ).run(reason, rx.id);
    advanceVisit(rx.visit_id);
    audit(req.staff, 'Marked medication unavailable', 'prescription', rx.id, reason);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- drug inventory ---------------------------- */

router.get('/inventory/list', (req, res, next) => {
  try {
    const role = req.staff.role;
    if (
      role !== 'admin' &&
      !hasPermission(role, 'medications.manage') &&
      !hasPermission(role, 'prescriptions.manage') &&
      !hasPermission(role, 'prescriptions.dispense')
    ) {
      fail('Your role does not allow this action', 403);
    }
    const rows = db.prepare('SELECT * FROM medications ORDER BY name').all();
    res.json({ medications: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/inventory/list', requirePerm('medications.manage'), (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) fail('Medication name is required');
    const info = db
      .prepare(
        `INSERT INTO medications (name, form, strength, unit_price, stock_qty, reorder_level, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        name,
        b.form?.trim() || null,
        b.strength?.trim() || null,
        Math.max(0, int(b.unit_price, 0)),
        Math.max(0, int(b.stock_qty, 0)),
        Math.max(0, int(b.reorder_level, 10)),
        nowIso(),
        nowIso(),
      );
    audit(req.staff, 'Added medication to inventory', 'medication', Number(info.lastInsertRowid), name);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

router.patch('/inventory/list/:id', requirePerm('medications.manage'), (req, res, next) => {
  try {
    const med = db.prepare('SELECT * FROM medications WHERE id = ?').get(Number(req.params.id));
    if (!med) fail('Medication not found', 404);
    const b = req.body || {};
    const stock = b.stock_qty !== undefined ? Math.max(0, int(b.stock_qty, med.stock_qty)) : med.stock_qty;
    db.prepare(
      `UPDATE medications SET name = ?, form = ?, strength = ?, unit_price = ?, stock_qty = ?, reorder_level = ?,
        active = ?, updated_at = ? WHERE id = ?`,
    ).run(
      b.name?.trim() || med.name,
      b.form !== undefined ? b.form?.trim() || null : med.form,
      b.strength !== undefined ? b.strength?.trim() || null : med.strength,
      b.unit_price !== undefined ? Math.max(0, int(b.unit_price, med.unit_price)) : med.unit_price,
      stock,
      b.reorder_level !== undefined ? Math.max(0, int(b.reorder_level, med.reorder_level)) : med.reorder_level,
      b.active !== undefined ? (b.active ? 1 : 0) : med.active,
      nowIso(),
      med.id,
    );
    audit(req.staff, 'Updated medication', 'medication', med.id, `${med.name} stock ${med.stock_qty} → ${stock}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/inventory/list/:id/restock', requirePerm('medications.manage'), (req, res, next) => {
  try {
    const med = db.prepare('SELECT * FROM medications WHERE id = ?').get(Number(req.params.id));
    if (!med) fail('Medication not found', 404);
    const qty = int(req.body?.quantity, 0);
    if (!qty || qty <= 0) fail('Enter a quantity greater than zero');
    db.prepare('UPDATE medications SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?').run(
      qty,
      nowIso(),
      med.id,
    );
    audit(req.staff, 'Restocked medication', 'medication', med.id, `${med.name} +${qty}`);
    res.json({ ok: true, stock_qty: med.stock_qty + qty });
  } catch (err) {
    next(err);
  }
});

/* ---------------------- pending prescriptions (staff view) -------------- */

router.get('/for-visit/:visitId', requireAuth, (req, res, next) => {
  try {
    const rows = db
      .prepare('SELECT * FROM prescriptions WHERE visit_id = ? ORDER BY prescribed_at')
      .all(Number(req.params.visitId));
    res.json({ prescriptions: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
