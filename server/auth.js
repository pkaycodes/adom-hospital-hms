import { db } from './db.js';
import { newToken } from './crypto.js';
import { hasPermission, permissionsFor, ROLE_LABELS } from './permissions.js';
import { AppError, nowIso } from './util.js';

const COOKIE = 'hms_session';
const SESSION_HOURS = 12;

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function createSession(res, staffId) {
  const token = newToken();
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_HOURS * 3600 * 1000);
  db.prepare('INSERT INTO sessions (token, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    staffId,
    created.toISOString(),
    expires.toISOString(),
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600 * 1000,
  });
  return token;
}

export function destroySession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE]) db.prepare('DELETE FROM sessions WHERE token = ?').run(cookies[COOKIE]);
  res.clearCookie(COOKIE, { path: '/' });
}

export function currentStaff(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE];
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(session.staff_id);
  if (!staff || !staff.is_active) return null;
  return staff;
}

export function publicStaff(staff) {
  return {
    id: staff.id,
    username: staff.username,
    full_name: staff.full_name,
    role: staff.role,
    role_label: staff.role_label || ROLE_LABELS[staff.role] || staff.role,
    phone: staff.phone,
    email: staff.email,
    is_active: !!staff.is_active,
    last_login_at: staff.last_login_at,
    permissions: permissionsFor(staff.role),
  };
}

export function requireAuth(req, res, next) {
  const staff = currentStaff(req);
  if (!staff) return next(new AppError(401, 'Please sign in to continue'));
  req.staff = staff;
  next();
}

export function requirePerm(permission) {
  return (req, res, next) => {
    if (!req.staff) return next(new AppError(401, 'Please sign in to continue'));
    if (!hasPermission(req.staff.role, permission)) {
      return next(new AppError(403, 'Your role does not allow this action'));
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (req.staff?.role !== 'admin') return next(new AppError(403, 'Administrator access required'));
  next();
}

export function touchLogin(staffId) {
  db.prepare('UPDATE staff SET last_login_at = ? WHERE id = ?').run(nowIso(), staffId);
}

export function pruneSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}
