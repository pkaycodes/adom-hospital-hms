import { Router } from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db } from '../db.js';
import { hashPassword } from '../crypto.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { hasPermission, ROLE_LABELS } from '../permissions.js';
import { audit, cleanPhone, fail, int, nowIso, requireFields, today } from '../util.js';

const router = Router();
router.use(requireAuth);

const SERVICE_CATEGORIES = [
  'Consultation',
  'Nursing',
  'Laboratory',
  'Imaging',
  'Procedure',
  'Admission',
  'Pharmacy',
  'Other',
];

const VISIT_STATUSES = {
  awaiting_nursing: 'Waiting for nursing',
  awaiting_doctor: 'Waiting for doctor',
  consulting: 'In consultation',
  awaiting_lab: 'Awaiting laboratory',
  awaiting_pharmacy: 'Awaiting pharmacy',
  awaiting_payment: 'Awaiting payment',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

router.get('/meta', (req, res) => {
  res.json({
    roles: ROLE_LABELS,
    service_categories: SERVICE_CATEGORIES,
    visit_statuses: VISIT_STATUSES,
  });
});

/* -------------------------------- staff --------------------------------- */

router.get('/staff/doctors', (req, res, next) => {
  try {
    const rows = db
      .prepare(
        "SELECT id, full_name, role FROM staff WHERE role = 'doctor' AND is_active = 1 ORDER BY full_name",
      )
      .all();
    res.json({ doctors: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/staff', requireAdmin, (req, res, next) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, username, full_name, role, role_label, phone, email, is_active, created_at, last_login_at
         FROM staff ORDER BY full_name`,
      )
      .all();
    res.json({ staff: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/staff', requireAdmin, (req, res, next) => {
  try {
    const b = req.body || {};
    requireFields(b, ['username', 'password', 'full_name', 'role']);
    const username = String(b.username).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      fail('Username must be 3–32 characters using letters, numbers, dots, dashes or underscores');
    }
    if (!ROLE_LABELS[b.role]) fail('Select a valid role');
    if (b.role === 'other' && !String(b.role_label || '').trim()) fail('Enter the staff role name');
    if (String(b.password).length < 6) fail('Password must be at least 6 characters');
    const exists = db.prepare('SELECT id FROM staff WHERE lower(username) = ?').get(username);
    if (exists) fail('That username is already taken');
    const info = db
      .prepare(
        `INSERT INTO staff (username, password_hash, full_name, role, role_label, phone, email, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        username,
        hashPassword(String(b.password)),
        String(b.full_name).trim(),
        b.role,
        b.role === 'other' ? String(b.role_label).trim() : null,
        cleanPhone(b.phone),
        b.email?.trim() || null,
        nowIso(),
      );
    const id = Number(info.lastInsertRowid);
    audit(req.staff, 'Created staff account', 'staff', id, `${b.full_name} (${b.role})`);
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.patch('/staff/:id', requireAdmin, (req, res, next) => {
  try {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(req.params.id));
    if (!staff) fail('Staff member not found', 404);
    const b = req.body || {};
    const role = b.role || staff.role;
    if (!ROLE_LABELS[role]) fail('Select a valid role');
    if (staff.id === req.staff.id && (role !== 'admin' || b.is_active === false)) {
      fail('You cannot remove your own administrator access');
    }
    if (staff.role === 'admin' && role !== 'admin') {
      const admins = db.prepare("SELECT COUNT(*) AS c FROM staff WHERE role='admin' AND is_active=1").get().c;
      if (admins <= 1) fail('At least one active administrator is required');
    }
    db.prepare(
      `UPDATE staff SET full_name = ?, role = ?, role_label = ?, phone = ?, email = ?, is_active = ? WHERE id = ?`,
    ).run(
      b.full_name?.trim() || staff.full_name,
      role,
      role === 'other' ? b.role_label?.trim() || staff.role_label || 'Other staff' : null,
      b.phone !== undefined ? cleanPhone(b.phone) : staff.phone,
      b.email !== undefined ? b.email?.trim() || null : staff.email,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : staff.is_active,
      staff.id,
    );
    audit(req.staff, 'Updated staff account', 'staff', staff.id, staff.full_name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/staff/:id/password', requireAdmin, (req, res, next) => {
  try {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(req.params.id));
    if (!staff) fail('Staff member not found', 404);
    const password = String(req.body?.password || '');
    if (password.length < 6) fail('Password must be at least 6 characters');
    db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?').run(hashPassword(password), staff.id);
    db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(staff.id);
    audit(req.staff, 'Reset staff password', 'staff', staff.id, staff.full_name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- services ------------------------------- */

function canViewServices(staff) {
  return (
    hasPermission(staff.role, 'services.view') ||
    hasPermission(staff.role, 'billing.view') ||
    hasPermission(staff.role, 'billing.manage') ||
    staff.role === 'lab'
  );
}

router.get('/services', (req, res, next) => {
  try {
    if (!canViewServices(req.staff)) fail('Your role does not allow this action', 403);
    const all = req.query.all === '1' && req.staff.role === 'admin';
    const rows = db
      .prepare(`SELECT * FROM services ${all ? '' : 'WHERE active = 1'} ORDER BY category, name`)
      .all();
    res.json({ services: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/services', requireAdmin, (req, res, next) => {
  try {
    const b = req.body || {};
    requireFields(b, ['name', 'category', 'price']);
    if (!SERVICE_CATEGORIES.includes(b.category)) fail('Select a valid service category');
    const price = int(b.price);
    if (price === null || price < 0) fail('Enter a valid price');
    const info = db
      .prepare(
        `INSERT INTO services (name, category, price, description, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(b.name.trim(), b.category, price, b.description?.trim() || null, nowIso(), nowIso());
    audit(req.staff, 'Added service', 'service', Number(info.lastInsertRowid), `${b.name} — ${price}`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

router.patch('/services/:id', requireAdmin, (req, res, next) => {
  try {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(Number(req.params.id));
    if (!service) fail('Service not found', 404);
    const b = req.body || {};
    db.prepare(
      `UPDATE services SET name = ?, category = ?, price = ?, description = ?, active = ?, updated_at = ? WHERE id = ?`,
    ).run(
      b.name?.trim() || service.name,
      SERVICE_CATEGORIES.includes(b.category) ? b.category : service.category,
      b.price !== undefined ? Math.max(0, int(b.price, service.price)) : service.price,
      b.description !== undefined ? b.description?.trim() || null : service.description,
      b.active !== undefined ? (b.active ? 1 : 0) : service.active,
      nowIso(),
      service.id,
    );
    audit(
      req.staff,
      'Updated service',
      'service',
      service.id,
      `${service.name}: ${service.price} → ${b.price ?? service.price}${b.active === false ? ' (deactivated)' : ''}`,
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- settings ------------------------------- */

router.get('/settings', (req, res, next) => {
  try {
    res.json({ settings: db.prepare('SELECT * FROM settings WHERE id = 1').get() });
  } catch (err) {
    next(err);
  }
});

router.patch('/settings', requireAdmin, (req, res, next) => {
  try {
    const b = req.body || {};
    const current = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!b.name?.trim()) fail('Hospital name is required');
    let logoUrl = b.logo_url !== undefined ? b.logo_url : current.logo_url;
    if (logoUrl) {
      logoUrl = String(logoUrl);
      if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(logoUrl)) {
        fail('The logo must be an uploaded PNG, JPEG, WebP or GIF image');
      }
      if (logoUrl.length > 400000) fail('The logo image is too large (maximum 300 KB)');
    } else {
      logoUrl = null;
    }
    db.prepare(
      `UPDATE settings SET name = ?, address = ?, phone = ?, email = ?, momo_number = ?, logo_text = ?, logo_url = ?, updated_at = ? WHERE id = 1`,
    ).run(
      b.name.trim(),
      b.address?.trim() || null,
      b.phone?.trim() || null,
      b.email?.trim() || null,
      b.momo_number?.trim() || null,
      (b.logo_text?.trim() || current.logo_text || 'AM').slice(0, 3).toUpperCase(),
      logoUrl,
      nowIso(),
    );
    audit(req.staff, 'Updated hospital information', 'settings', 1, b.name);
    res.json({ settings: db.prepare('SELECT * FROM settings WHERE id = 1').get() });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- audit -------------------------------- */

router.get('/audit', requireAdmin, (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT * FROM audit_logs
         WHERE (? = '' OR staff_name LIKE ? OR action LIKE ? OR entity LIKE ? OR details LIKE ?)
         ORDER BY created_at DESC LIMIT 300`,
      )
      .all(q, like, like, like, like);
    res.json({ logs: rows });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- backup -------------------------------- */

router.get('/backup', requireAdmin, (req, res, next) => {
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'hms-backup-'));
    const file = path.join(dir, `hms-backup-${today()}.db`);
    db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
    audit(req.staff, 'Downloaded database backup', 'system', null, path.basename(file));
    res.download(file, path.basename(file), () => {
      rmSync(dir, { recursive: true, force: true });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
