import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword } from '../crypto.js';
import {
  createSession,
  destroySession,
  publicStaff,
  requireAuth,
  touchLogin,
} from '../auth.js';
import { audit, fail, nowIso } from '../util.js';

const router = Router();

router.post('/login', (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) fail('Enter your username and password');
    const staff = db.prepare('SELECT * FROM staff WHERE lower(username) = ?').get(username);
    if (!staff || !verifyPassword(password, staff.password_hash)) {
      return next(Object.assign(new Error('Invalid username or password'), { status: 401 }));
    }
    if (!staff.is_active) {
      return next(Object.assign(new Error('This account has been deactivated'), { status: 403 }));
    }
    createSession(res, staff.id);
    touchLogin(staff.id);
    audit(staff, 'Signed in', 'session', staff.id);
    res.json({ user: publicStaff(staff) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  const staff = req.staff;
  destroySession(req, res);
  if (staff) audit(staff, 'Signed out', 'session', staff.id);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicStaff(req.staff) });
});

router.post('/change-password', requireAuth, (req, res, next) => {
  try {
    const current = String(req.body?.current_password || '');
    const next_ = String(req.body?.new_password || '');
    if (!verifyPassword(current, req.staff.password_hash)) fail('Current password is incorrect');
    if (next_.length < 6) fail('New password must be at least 6 characters');
    db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?').run(
      hashPassword(next_),
      req.staff.id,
    );
    audit(req.staff, 'Changed own password', 'staff', req.staff.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
