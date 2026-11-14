import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requirePerm } from '../auth.js';
import {
  addInvoiceItem,
  advanceVisit,
  ageFromDob,
  audit,
  fail,
  invoiceNo,
  invoiceTotals,
  int,
  nowIso,
  num,
  recalcInvoice,
  requireFields,
  visitNo,
} from '../util.js';

const router = Router();
router.use(requireAuth);

export const VISIT_SELECT = `
  SELECT v.*, p.full_name AS patient_name, p.patient_no, p.gender, p.phone AS patient_phone,
         p.date_of_birth, p.allergies, p.nhis_number, p.nhis_status,
         d.full_name AS doctor_name, n.full_name AS nurse_name,
         (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
            WHERE i.visit_id = v.id AND ii.status = 'active') AS billed,
         (SELECT COALESCE(SUM(pay.amount),0) FROM payments pay JOIN invoices i ON i.id = pay.invoice_id
            WHERE i.visit_id = v.id AND pay.status = 'confirmed') AS paid,
         (SELECT COUNT(*) FROM vitals vt WHERE vt.visit_id = v.id) AS vitals_done,
         (SELECT COUNT(*) FROM lab_requests l WHERE l.visit_id = v.id AND l.status IN ('pending','in_progress')) AS pending_labs,
         (SELECT COUNT(*) FROM prescriptions rx WHERE rx.visit_id = v.id AND rx.status = 'pending') AS pending_rx
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  LEFT JOIN staff d ON d.id = v.doctor_id
  LEFT JOIN staff n ON n.id = v.nurse_id
`;

export function visitSummary(id) {
  const row = db.prepare(`${VISIT_SELECT} WHERE v.id = ?`).get(id);
  if (!row) return null;
  return { ...row, age: ageFromDob(row.date_of_birth), balance: Math.max((row.billed || 0) - (row.paid || 0), 0) };
}

export function getVisitDetail(id) {
  const visit = visitSummary(id);
  if (!visit) return null;
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(visit.patient_id);
  const vitals = db
    .prepare(
      `SELECT vt.*, s.full_name AS recorded_by_name FROM vitals vt
       LEFT JOIN staff s ON s.id = vt.recorded_by WHERE vt.visit_id = ?`,
    )
    .get(id);
  const consultation = db
    .prepare(
      `SELECT c.*, s.full_name AS doctor_name FROM consultations c
       LEFT JOIN staff s ON s.id = c.doctor_id WHERE c.visit_id = ?`,
    )
    .get(id);
  const labs = db
    .prepare(
      `SELECT l.*, s.full_name AS requested_by_name, r.full_name AS resulted_by_name
       FROM lab_requests l LEFT JOIN staff s ON s.id = l.requested_by
       LEFT JOIN staff r ON r.id = l.resulted_by
       WHERE l.visit_id = ? ORDER BY l.requested_at`,
    )
    .all(id);
  const prescriptions = db
    .prepare(
      `SELECT rx.*, s.full_name AS prescribed_by_name, d.full_name AS dispensed_by_name
       FROM prescriptions rx LEFT JOIN staff s ON s.id = rx.prescribed_by
       LEFT JOIN staff d ON d.id = rx.dispensed_by
       WHERE rx.visit_id = ? ORDER BY rx.prescribed_at`,
    )
    .all(id);
  const invoice = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(id);
  let invoiceDetail = null;
  if (invoice) {
    const items = db
      .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at')
      .all(invoice.id);
    const payments = db
      .prepare(
        `SELECT p.*, s.full_name AS cashier_name FROM payments p
         LEFT JOIN staff s ON s.id = p.received_by WHERE p.invoice_id = ? ORDER BY p.paid_at`,
      )
      .all(invoice.id);
    invoiceDetail = { ...invoice, ...invoiceTotals(invoice.id), items, payments };
  }
  const previous = db
    .prepare(
      `SELECT c.diagnosis, c.symptoms, c.completed_at, v.visit_no, v.created_at, s.full_name AS doctor_name
       FROM consultations c JOIN visits v ON v.id = c.visit_id
       LEFT JOIN staff s ON s.id = c.doctor_id
       WHERE v.patient_id = ? AND v.id <> ? AND c.diagnosis IS NOT NULL AND c.diagnosis <> ''
       ORDER BY v.created_at DESC LIMIT 8`,
    )
    .all(visit.patient_id, id);
  const previousPrescriptions = db
    .prepare(
      `SELECT rx.drug_name, rx.dosage, rx.frequency, rx.quantity, rx.prescribed_at, v.visit_no
       FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
       WHERE rx.patient_id = ? AND v.id <> ? ORDER BY rx.prescribed_at DESC LIMIT 8`,
    )
    .all(visit.patient_id, id);

  return {
    visit,
    patient: { ...patient, age: ageFromDob(patient.date_of_birth) },
    vitals: vitals || null,
    consultation: consultation || null,
    labs,
    prescriptions,
    invoice: invoiceDetail,
    history: {
      diagnoses: previous,
      prescriptions: previousPrescriptions,
    },
  };
}

/* ------------------------------- visits -------------------------------- */

router.get('/', requirePerm('visits.view'), (req, res, next) => {
  try {
    const clauses = [];
    const params = [];
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').filter(Boolean);
      clauses.push(`v.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (req.query.patient_id) {
      clauses.push('v.patient_id = ?');
      params.push(Number(req.query.patient_id));
    }
    if (req.query.doctor_id) {
      clauses.push('v.doctor_id = ?');
      params.push(Number(req.query.doctor_id));
    }
    if (req.query.today === '1') {
      clauses.push('date(v.created_at) = ?');
      params.push(new Date().toISOString().slice(0, 10));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`${VISIT_SELECT} ${where} ORDER BY v.created_at DESC LIMIT 200`)
      .all(...params);
    res.json({
      visits: rows.map((r) => ({
        ...r,
        age: ageFromDob(r.date_of_birth),
        balance: Math.max((r.billed || 0) - (r.paid || 0), 0),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePerm('visits.manage'), (req, res, next) => {
  try {
    const body = req.body || {};
    requireFields(body, ['patient_id', 'reason']);
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(Number(body.patient_id));
    if (!patient) fail('Select a registered patient');
    if (patient.archived) fail('This patient record is archived');
    const doctorId = body.doctor_id ? Number(body.doctor_id) : null;
    if (doctorId) {
      const doctor = db.prepare("SELECT * FROM staff WHERE id = ? AND role = 'doctor' AND is_active = 1").get(doctorId);
      if (!doctor) fail('Select a valid doctor');
    }
    const created = nowIso();
    const vNo = visitNo();
    const info = db
      .prepare(
        `INSERT INTO visits (visit_no, patient_id, reason, status, doctor_id, consultation_completed, created_by, created_at, updated_at)
         VALUES (?, ?, ?, 'awaiting_nursing', ?, 0, ?, ?, ?)`,
      )
      .run(vNo, patient.id, String(body.reason).trim(), doctorId, req.staff.id, created, created);
    const visitId = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO invoices (invoice_no, visit_id, patient_id, total, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 0, 'open', ?, ?, ?)`,
    ).run(invoiceNo(), visitId, patient.id, req.staff.id, created, created);
    audit(req.staff, 'Created visit', 'visit', visitId, `${vNo} for ${patient.full_name}`);
    res.status(201).json(getVisitDetail(visitId));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePerm('visits.view'), (req, res, next) => {
  try {
    const detail = getVisitDetail(Number(req.params.id));
    if (!detail) fail('Visit not found', 404);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/start-consultation', requirePerm('consultation.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const detail = getVisitDetail(id);
    if (!detail) fail('Visit not found', 404);
    if (['completed', 'cancelled'].includes(detail.visit.status)) fail('This visit is closed');
    if (!detail.vitals) fail('Vital signs must be recorded by a nurse before consultation');
    db.prepare(
      "UPDATE visits SET status = 'consulting', doctor_id = ?, updated_at = ? WHERE id = ?",
    ).run(req.staff.id, nowIso(), id);
    audit(req.staff, 'Started consultation', 'visit', id, detail.visit.visit_no);
    res.json(getVisitDetail(id));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- vitals -------------------------------- */

router.post('/:id/vitals', requirePerm('vitals.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(id);
    if (!visit) fail('Visit not found', 404);
    if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
    const b = req.body || {};
    if (!b.complaints?.trim()) fail('Record the presenting complaints');
    const systolic = int(b.bp_systolic);
    const diastolic = int(b.bp_diastolic);
    if (systolic !== null && (systolic < 50 || systolic > 300)) fail('Blood pressure systolic looks invalid');
    if (diastolic !== null && (diastolic < 30 || diastolic > 200)) fail('Blood pressure diastolic looks invalid');
    const temp = num(b.temperature);
    if (temp !== null && (temp < 30 || temp > 45)) fail('Temperature must be between 30 and 45 °C');
    const spo2 = int(b.spo2);
    if (spo2 !== null && (spo2 < 50 || spo2 > 100)) fail('SpO2 must be between 50 and 100%');
    const pulse = int(b.pulse);
    if (pulse !== null && (pulse < 20 || pulse > 250)) fail('Pulse rate looks invalid');

    const recorded = nowIso();
    const existing = db.prepare('SELECT * FROM vitals WHERE visit_id = ?').get(id);
    if (existing) {
      db.prepare(
        `UPDATE vitals SET bp_systolic=?, bp_diastolic=?, temperature=?, pulse=?, resp_rate=?, spo2=?,
          weight=?, height=?, glucose=?, complaints=?, recorded_by=?, recorded_at=?, updated_at=? WHERE visit_id=?`,
      ).run(
        systolic,
        diastolic,
        temp,
        pulse,
        int(b.resp_rate),
        spo2,
        num(b.weight),
        num(b.height),
        num(b.glucose),
        b.complaints.trim(),
        req.staff.id,
        recorded,
        recorded,
        id,
      );
    } else {
      db.prepare(
        `INSERT INTO vitals (visit_id, bp_systolic, bp_diastolic, temperature, pulse, resp_rate, spo2,
          weight, height, glucose, complaints, recorded_by, recorded_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        systolic,
        diastolic,
        temp,
        pulse,
        int(b.resp_rate),
        spo2,
        num(b.weight),
        num(b.height),
        num(b.glucose),
        b.complaints.trim(),
        req.staff.id,
        recorded,
        recorded,
      );
    }
    if (visit.status === 'awaiting_nursing') {
      db.prepare("UPDATE visits SET status = 'awaiting_doctor', nurse_id = ?, updated_at = ? WHERE id = ?").run(
        req.staff.id,
        recorded,
        id,
      );
    }
    audit(req.staff, existing ? 'Updated vital signs' : 'Recorded vital signs', 'visit', id, visit.visit_no);
    res.json(getVisitDetail(id));
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- consultations ----------------------------- */

router.post('/:id/consultation', requirePerm('consultation.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(id);
    if (!visit) fail('Visit not found', 404);
    if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
    const b = req.body || {};
    const complete = !!b.complete;
    if (complete) {
      if (!String(b.diagnosis || '').trim()) fail('Enter a diagnosis before completing the consultation');
      if (!String(b.clinical_notes || '').trim() && !String(b.symptoms || '').trim()) {
        fail('Record symptoms or clinical notes before completing');
      }
    }
    const doctorId = visit.doctor_id || req.staff.id;
    const stamp = nowIso();
    const existing = db.prepare('SELECT * FROM consultations WHERE visit_id = ?').get(id);
    const serviceId = b.consultation_service_id ? Number(b.consultation_service_id) : null;

    if (existing) {
      db.prepare(
        `UPDATE consultations SET doctor_id=?, symptoms=?, clinical_notes=?, diagnosis=?, treatment_plan=?,
          follow_up_instructions=?, consultation_service_id=?, completed=?, updated_at=?,
          completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, ?) ELSE completed_at END
         WHERE visit_id=?`,
      ).run(
        doctorId,
        b.symptoms?.trim() || null,
        b.clinical_notes?.trim() || null,
        b.diagnosis?.trim() || null,
        b.treatment_plan?.trim() || null,
        b.follow_up_instructions?.trim() || null,
        serviceId || existing.consultation_service_id,
        complete ? 1 : existing.completed,
        stamp,
        complete ? 1 : 0,
        stamp,
        id,
      );
    } else {
      db.prepare(
        `INSERT INTO consultations (visit_id, doctor_id, symptoms, clinical_notes, diagnosis, treatment_plan,
          follow_up_instructions, consultation_service_id, completed, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        doctorId,
        b.symptoms?.trim() || null,
        b.clinical_notes?.trim() || null,
        b.diagnosis?.trim() || null,
        b.treatment_plan?.trim() || null,
        b.follow_up_instructions?.trim() || null,
        serviceId,
        complete ? 1 : 0,
        stamp,
        stamp,
        complete ? stamp : null,
      );
    }

    if (visit.status === 'awaiting_doctor') {
      db.prepare("UPDATE visits SET status = 'consulting', doctor_id = ? WHERE id = ?").run(doctorId, id);
    }

    if (complete) {
      const service = serviceId
        ? db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId)
        : db.prepare("SELECT * FROM services WHERE category = 'Consultation' AND active = 1 ORDER BY price LIMIT 1").get();
      const invoice = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(id);
      const already = invoice
        ? db
            .prepare(
              "SELECT id FROM invoice_items WHERE invoice_id = ? AND source_type = 'consultation' AND status = 'active'",
            )
            .get(invoice.id)
        : null;
      if (invoice && service && !already) {
        addInvoiceItem({
          invoiceId: invoice.id,
          serviceId: service.id,
          description: service.name,
          category: service.category,
          unitPrice: service.price,
          quantity: 1,
          sourceType: 'consultation',
          sourceId: id,
          staffId: req.staff.id,
        });
      }
      db.prepare(
        'UPDATE visits SET consultation_completed = 1, follow_up = ?, updated_at = ? WHERE id = ?',
      ).run(b.follow_up_instructions?.trim() || null, stamp, id);
      advanceVisit(id);
    }
    audit(
      req.staff,
      complete ? 'Completed consultation' : 'Saved consultation draft',
      'visit',
      id,
      visit.visit_no,
    );
    res.json(getVisitDetail(id));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ lab tests ------------------------------- */

router.post('/:id/labs', requirePerm('labs.request'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(id);
    if (!visit) fail('Visit not found', 404);
    if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
    const tests = Array.isArray(req.body?.tests) ? req.body.tests : [];
    if (!tests.length) fail('Select at least one laboratory test');
    const invoice = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(id);
    const created = [];
    for (const raw of tests) {
      const serviceId = Number(raw.service_id ?? raw.serviceId ?? raw);
      const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
      if (!service || !service.active) fail('Select a valid laboratory test');
      if (!['Laboratory', 'Imaging'].includes(service.category)) {
        fail(`${service.name} is not a laboratory or imaging service`);
      }
      const stamp = nowIso();
      const info = db
        .prepare(
          `INSERT INTO lab_requests (visit_id, patient_id, service_id, test_name, price, status, requested_by, requested_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .run(id, visit.patient_id, service.id, service.name, service.price, req.staff.id, stamp);
      const labId = Number(info.lastInsertRowid);
      let itemId = null;
      if (invoice) {
        itemId = addInvoiceItem({
          invoiceId: invoice.id,
          serviceId: service.id,
          description: service.name,
          category: service.category,
          unitPrice: service.price,
          quantity: 1,
          sourceType: 'lab',
          sourceId: labId,
          staffId: req.staff.id,
        });
        db.prepare('UPDATE lab_requests SET invoice_item_id = ? WHERE id = ?').run(itemId, labId);
      }
      created.push(labId);
    }
    audit(req.staff, 'Requested laboratory tests', 'visit', id, `${created.length} test(s) for ${visit.visit_no}`);
    res.status(201).json({ created, visit: getVisitDetail(id) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/labs', requirePerm('visits.view'), (req, res, next) => {
  try {
    const rows = db
      .prepare(
        `SELECT l.*, p.full_name AS patient_name, p.patient_no, v.visit_no, s.full_name AS requested_by_name,
                r.full_name AS resulted_by_name
         FROM lab_requests l JOIN patients p ON p.id = l.patient_id
         JOIN visits v ON v.id = l.visit_id
         LEFT JOIN staff s ON s.id = l.requested_by
         LEFT JOIN staff r ON r.id = l.resulted_by
         WHERE l.visit_id = ? ORDER BY l.requested_at`,
      )
      .all(Number(req.params.id));
    res.json({ labs: rows });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- prescriptions ------------------------------ */

router.post('/:id/prescriptions', requirePerm('prescriptions.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(id);
    if (!visit) fail('Visit not found', 404);
    if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
    const b = req.body || {};
    const medication = b.medication_id
      ? db.prepare('SELECT * FROM medications WHERE id = ?').get(Number(b.medication_id))
      : null;
    const drugName = String(b.drug_name || medication?.name || '').trim();
    if (!drugName) fail('Select or enter a medication');
    const quantity = Math.max(1, int(b.quantity, 1));
    const info = db
      .prepare(
        `INSERT INTO prescriptions (visit_id, patient_id, medication_id, drug_name, dosage, frequency, duration,
          quantity, instructions, status, price, prescribed_by, prescribed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        id,
        visit.patient_id,
        medication?.id ?? null,
        drugName,
        b.dosage?.trim() || null,
        b.frequency?.trim() || null,
        b.duration?.trim() || null,
        quantity,
        b.instructions?.trim() || null,
        medication?.unit_price ?? 0,
        req.staff.id,
        nowIso(),
      );
    audit(req.staff, 'Prescribed medication', 'visit', id, `${drugName} × ${quantity}`);
    res.status(201).json(getVisitDetail(id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/prescriptions/:rxId/cancel', requirePerm('prescriptions.manage'), (req, res, next) => {
  try {
    const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ? AND visit_id = ?').get(
      Number(req.params.rxId),
      Number(req.params.id),
    );
    if (!rx) fail('Prescription not found', 404);
    if (rx.status !== 'pending') fail('Only pending prescriptions can be cancelled');
    db.prepare("UPDATE prescriptions SET status = 'cancelled' WHERE id = ?").run(rx.id);
    if (rx.invoice_item_id) {
      db.prepare("UPDATE invoice_items SET status = 'cancelled' WHERE id = ?").run(rx.invoice_item_id);
      const item = db.prepare('SELECT invoice_id FROM invoice_items WHERE id = ?').get(rx.invoice_item_id);
      if (item) recalcInvoice(item.invoice_id);
    }
    advanceVisit(Number(req.params.id));
    audit(req.staff, 'Cancelled prescription', 'prescription', rx.id, rx.drug_name);
    res.json(getVisitDetail(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

export default router;
