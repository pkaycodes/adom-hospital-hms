import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requirePerm } from '../auth.js';
import { permissionsFor } from '../permissions.js';
import { advanceVisit, audit, fail, int, nowIso } from '../util.js';

const router = Router();
router.use(requireAuth);

function requireAny(permission) {
  return (req, res, next) => {
    if (req.staff.role === 'admin') return next();
    if (!permissionsFor(req.staff.role).includes(permission)) {
      return next(Object.assign(new Error('Your role does not allow this action'), { status: 403 }));
    }
    next();
  };
}

router.get('/', requireAny('labs.manage'), (req, res, next) => {
  try {
    const status = String(req.query.status || 'pending,in_progress').split(',').filter(Boolean);
    const rows = db
      .prepare(
        `SELECT l.*, p.full_name AS patient_name, p.patient_no, p.gender, p.date_of_birth, p.allergies,
                v.visit_no, v.reason, s.full_name AS requested_by_name, r.full_name AS resulted_by_name,
                d.full_name AS doctor_name
         FROM lab_requests l
         JOIN patients p ON p.id = l.patient_id
         JOIN visits v ON v.id = l.visit_id
         LEFT JOIN staff s ON s.id = l.requested_by
         LEFT JOIN staff r ON r.id = l.resulted_by
         LEFT JOIN staff d ON d.id = v.doctor_id
         WHERE l.status IN (${status.map(() => '?').join(',')})
         ORDER BY l.requested_at DESC LIMIT 200`,
      )
      .all(...status);
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAny('labs.manage'), (req, res, next) => {
  try {
    const lab = db.prepare('SELECT * FROM lab_requests WHERE id = ?').get(Number(req.params.id));
    if (!lab) fail('Laboratory request not found', 404);
    const b = req.body || {};
    const status = b.status || lab.status;
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) fail('Invalid status');
    if (status === 'completed' && !String(b.result || '').trim()) fail('Enter the test result before completing');
    if (['completed', 'cancelled'].includes(lab.status) && status !== lab.status && req.staff.role !== 'admin') {
      fail('This request is already closed');
    }
    db.prepare(
      `UPDATE lab_requests SET status = ?, result = ?, result_notes = ?, resulted_by = ?, resulted_at = ? WHERE id = ?`,
    ).run(
      status,
      status === 'completed' ? String(b.result).trim() : b.result !== undefined ? b.result : lab.result,
      b.result_notes !== undefined ? b.result_notes : lab.result_notes,
      status === 'completed' ? req.staff.id : lab.resulted_by,
      status === 'completed' ? nowIso() : lab.resulted_at,
      lab.id,
    );
    if (status === 'completed') {
      // A doctor is not required to be present; results become visible on the visit immediately.
      advanceVisit(lab.visit_id);
    }
    audit(req.staff, `Laboratory request ${status.replace('_', ' ')}`, 'lab', lab.id, `${lab.test_name} (${lab.visit_id})`);
    res.json({ ok: true, status });
  } catch (err) {
    next(err);
  }
});

export default router;
