import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requirePerm } from '../auth.js';
import {
  ageFromDob,
  audit,
  cleanDate,
  cleanPhone,
  fail,
  nowIso,
  patientNo,
  requireFields,
} from '../util.js';

const router = Router();
router.use(requireAuth);

function patientRow(row) {
  if (!row) return null;
  return { ...row, age: ageFromDob(row.date_of_birth) };
}

function getPatientDetail(id) {
  const patient = patientRow(db.prepare('SELECT * FROM patients WHERE id = ?').get(id));
  if (!patient) return null;
  const visits = db
    .prepare(
      `SELECT v.*, d.full_name AS doctor_name,
        (SELECT diagnosis FROM consultations c WHERE c.visit_id = v.id) AS diagnosis,
        (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
           WHERE i.visit_id = v.id AND ii.status='active') AS billed,
        (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.id = p.invoice_id
           WHERE i.visit_id = v.id AND p.status='confirmed') AS paid
       FROM visits v LEFT JOIN staff d ON d.id = v.doctor_id
       WHERE v.patient_id = ? ORDER BY v.created_at DESC`,
    )
    .all(id);
  const prescriptions = db
    .prepare(
      `SELECT rx.*, v.visit_no, s.full_name AS prescribed_by_name
       FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
       LEFT JOIN staff s ON s.id = rx.prescribed_by
       WHERE rx.patient_id = ? ORDER BY rx.prescribed_at DESC LIMIT 20`,
    )
    .all(id);
  const labResults = db
    .prepare(
      `SELECT l.*, v.visit_no FROM lab_requests l JOIN visits v ON v.id = l.visit_id
       WHERE l.patient_id = ? AND l.status = 'completed' ORDER BY l.resulted_at DESC LIMIT 20`,
    )
    .all(id);
  return { patient, visits, prescriptions, lab_results: labResults };
}

router.get('/', requirePerm('patients.view'), (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const archived = req.query.archived === '1' ? 1 : 0;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    let rows;
    if (q) {
      const like = `%${q}%`;
      rows = db
        .prepare(
          `SELECT p.*,
             (SELECT MAX(created_at) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
             (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.id) AS visit_count
           FROM patients p
           WHERE p.archived = ? AND (p.full_name LIKE ? OR p.patient_no LIKE ? OR p.phone LIKE ? OR p.nhis_number LIKE ?)
           ORDER BY p.full_name LIMIT ?`,
        )
        .all(archived, like, like, like, like, limit);
    } else {
      rows = db
        .prepare(
          `SELECT p.*,
             (SELECT MAX(created_at) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
             (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.id) AS visit_count
           FROM patients p WHERE p.archived = ? ORDER BY p.created_at DESC LIMIT ?`,
        )
        .all(archived, limit);
    }
    res.json({ patients: rows.map(patientRow) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePerm('patients.view'), (req, res, next) => {
  try {
    const detail = getPatientDetail(Number(req.params.id));
    if (!detail) fail('Patient not found', 404);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePerm('patients.manage'), (req, res, next) => {
  try {
    const body = req.body || {};
    requireFields(body, ['full_name', 'gender']);
    if (!['male', 'female', 'other'].includes(body.gender)) fail('Select a valid gender');
    const dob = cleanDate(body.date_of_birth, 'date of birth');
    if (dob && new Date(dob) > new Date()) fail('Date of birth cannot be in the future');
    const phone = cleanPhone(body.phone);
    const emergencyPhone = cleanPhone(body.emergency_phone);
    const nhisStatus = ['active', 'expired', 'none', ''].includes(body.nhis_status)
      ? body.nhis_status || 'none'
      : 'none';
    const info = db
      .prepare(
        `INSERT INTO patients
         (patient_no, full_name, date_of_birth, gender, phone, address, emergency_name, emergency_phone,
          ghana_card, nhis_number, nhis_status, allergies, conditions, notes, archived, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        patientNo(),
        String(body.full_name).trim(),
        dob,
        body.gender,
        phone,
        body.address?.trim() || null,
        body.emergency_name?.trim() || null,
        emergencyPhone,
        body.ghana_card?.trim() || null,
        body.nhis_number?.trim() || null,
        nhisStatus,
        body.allergies?.trim() || null,
        body.conditions?.trim() || null,
        body.notes?.trim() || null,
        req.staff.id,
        nowIso(),
      );
    const id = Number(info.lastInsertRowid);
    audit(req.staff, 'Registered patient', 'patient', id, body.full_name);
    res.status(201).json(getPatientDetail(id));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requirePerm('patients.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    if (!existing) fail('Patient not found', 404);
    const b = req.body || {};
    const dob = b.date_of_birth !== undefined ? cleanDate(b.date_of_birth, 'date of birth') : existing.date_of_birth;
    const phone = b.phone !== undefined ? cleanPhone(b.phone) : existing.phone;
    const emergencyPhone =
      b.emergency_phone !== undefined ? cleanPhone(b.emergency_phone) : existing.emergency_phone;
    db.prepare(
      `UPDATE patients SET full_name = ?, date_of_birth = ?, gender = ?, phone = ?, address = ?,
        emergency_name = ?, emergency_phone = ?, ghana_card = ?, nhis_number = ?, nhis_status = ?,
        allergies = ?, conditions = ?, notes = ?, updated_at = ? WHERE id = ?`,
    ).run(
      b.full_name?.trim() || existing.full_name,
      dob,
      b.gender || existing.gender,
      phone,
      b.address !== undefined ? b.address?.trim() || null : existing.address,
      b.emergency_name !== undefined ? b.emergency_name?.trim() || null : existing.emergency_name,
      emergencyPhone,
      b.ghana_card !== undefined ? b.ghana_card?.trim() || null : existing.ghana_card,
      b.nhis_number !== undefined ? b.nhis_number?.trim() || null : existing.nhis_number,
      b.nhis_status || existing.nhis_status,
      b.allergies !== undefined ? b.allergies?.trim() || null : existing.allergies,
      b.conditions !== undefined ? b.conditions?.trim() || null : existing.conditions,
      b.notes !== undefined ? b.notes?.trim() || null : existing.notes,
      nowIso(),
      id,
    );
    audit(req.staff, 'Updated patient record', 'patient', id, b.full_name || existing.full_name);
    res.json(getPatientDetail(id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/archive', requirePerm('patients.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    if (!existing) fail('Patient not found', 404);
    if (req.staff.role !== 'admin') fail('Administrator access required', 403);
    db.prepare('UPDATE patients SET archived = 1, updated_at = ? WHERE id = ?').run(nowIso(), id);
    audit(req.staff, 'Archived patient record', 'patient', id, existing.full_name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
