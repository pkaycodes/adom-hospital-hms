import {
  ROLE_LABELS,
  SERVICE_CATEGORIES,
  VISIT_STATUSES,
  ApiError,
  fail,
  json,
  nowIso,
  todayStr,
  all,
  first,
  run,
  ensureDb,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  currentStaff,
  publicStaff,
  patientNo,
  visitNo,
  invoiceNo,
  receiptNo,
  invoiceTotals,
  recalcInvoice,
  addInvoiceItem,
  advanceVisit,
  audit,
  requireFields,
  cleanPhone,
  cleanDate,
  int,
  num,
  ageFromDob,
  addDays,
  hasPermission,
} from './core.js';

const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  routes.push({ method, pattern, handler, ...opts });
};

async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  if (text.length > 2000000) fail('Request is too large', 413);
  try {
    return JSON.parse(text);
  } catch {
    fail('Invalid JSON request body');
  }
}

export async function handleApi(request, env, url) {
  try {
    await ensureDb(env);
    for (const r of routes) {
      if (r.method !== request.method) continue;
      const match = url.pathname.match(r.pattern);
      if (!match) continue;
      let staff = null;
      if (!r.public) {
        staff = await currentStaff(env, request);
        if (!staff) throw new ApiError(401, 'Please sign in to continue');
        if (r.admin && staff.role !== 'admin') throw new ApiError(403, 'Administrator access required');
        if (r.perm && !hasPermission(staff.role, r.perm)) {
          throw new ApiError(403, 'Your role does not allow this action');
        }
      }
      const body = ['POST', 'PATCH', 'PUT'].includes(request.method) ? await readBody(request) : null;
      return await r.handler({ request, env, url, staff, body, params: match.slice(1) });
    }
    throw new ApiError(404, 'API endpoint not found');
  } catch (err) {
    const status = err instanceof ApiError ? err.status : Number(err && err.status) >= 400 ? Number(err.status) : 500;
    if (status >= 500) console.error('[api]', err && err.stack ? err.stack : err);
    return json(
      { error: status >= 500 ? 'Something went wrong. Please try again.' : err.message || 'Request failed' },
      { status },
    );
  }
}

/* ------------------------------ shared data ------------------------------ */

function decorateVisit(row) {
  if (!row) return null;
  return {
    ...row,
    age: ageFromDob(row.date_of_birth),
    balance: Math.max((row.billed || 0) - (row.paid || 0), 0),
  };
}

const VISIT_SELECT = `
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

async function visitSummary(env, id) {
  return decorateVisit(await first(env, `${VISIT_SELECT} WHERE v.id = ?`, id));
}

async function getVisitDetail(env, id) {
  const visit = await visitSummary(env, id);
  if (!visit) return null;
  const patient = await first(env, 'SELECT * FROM patients WHERE id = ?', visit.patient_id);
  const vitals = await first(
    env,
    `SELECT vt.*, s.full_name AS recorded_by_name FROM vitals vt
     LEFT JOIN staff s ON s.id = vt.recorded_by WHERE vt.visit_id = ?`,
    id,
  );
  const consultation = await first(
    env,
    `SELECT c.*, s.full_name AS doctor_name FROM consultations c
     LEFT JOIN staff s ON s.id = c.doctor_id WHERE c.visit_id = ?`,
    id,
  );
  const labs = await all(
    env,
    `SELECT l.*, s.full_name AS requested_by_name, r.full_name AS resulted_by_name
     FROM lab_requests l LEFT JOIN staff s ON s.id = l.requested_by
     LEFT JOIN staff r ON r.id = l.resulted_by
     WHERE l.visit_id = ? ORDER BY l.requested_at`,
    id,
  );
  const prescriptions = await all(
    env,
    `SELECT rx.*, s.full_name AS prescribed_by_name, d.full_name AS dispensed_by_name
     FROM prescriptions rx LEFT JOIN staff s ON s.id = rx.prescribed_by
     LEFT JOIN staff d ON d.id = rx.dispensed_by
     WHERE rx.visit_id = ? ORDER BY rx.prescribed_at`,
    id,
  );
  const invoiceRow = await first(env, 'SELECT * FROM invoices WHERE visit_id = ?', id);
  let invoice = null;
  if (invoiceRow) {
    const items = await all(env, 'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at, id', invoiceRow.id);
    const payments = await all(
      env,
      `SELECT p.*, s.full_name AS cashier_name FROM payments p
       LEFT JOIN staff s ON s.id = p.received_by WHERE p.invoice_id = ? ORDER BY p.paid_at`,
      invoiceRow.id,
    );
    invoice = { ...invoiceRow, ...(await invoiceTotals(env, invoiceRow.id)), items, payments };
  }
  const history = {
    diagnoses: await all(
      env,
      `SELECT c.diagnosis, c.symptoms, c.completed_at, v.visit_no, v.created_at, s.full_name AS doctor_name
       FROM consultations c JOIN visits v ON v.id = c.visit_id
       LEFT JOIN staff s ON s.id = c.doctor_id
       WHERE v.patient_id = ? AND v.id <> ? AND c.diagnosis IS NOT NULL AND c.diagnosis <> ''
       ORDER BY v.created_at DESC LIMIT 8`,
      visit.patient_id,
      id,
    ),
    prescriptions: await all(
      env,
      `SELECT rx.drug_name, rx.dosage, rx.frequency, rx.quantity, rx.prescribed_at, v.visit_no
       FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
       WHERE rx.patient_id = ? AND v.id <> ? ORDER BY rx.prescribed_at DESC LIMIT 8`,
      visit.patient_id,
      id,
    ),
  };
  return {
    visit,
    patient: { ...patient, age: ageFromDob(patient.date_of_birth) },
    vitals: vitals || null,
    consultation: consultation || null,
    labs,
    prescriptions,
    invoice,
    history,
  };
}

async function getPatientDetail(env, id) {
  const patient = await first(env, 'SELECT * FROM patients WHERE id = ?', id);
  if (!patient) return null;
  const visits = await all(
    env,
    `SELECT v.*, d.full_name AS doctor_name,
       (SELECT diagnosis FROM consultations c WHERE c.visit_id = v.id) AS diagnosis,
       (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE i.visit_id = v.id AND ii.status='active') AS billed,
       (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.id = p.invoice_id
          WHERE i.visit_id = v.id AND p.status='confirmed') AS paid
     FROM visits v LEFT JOIN staff d ON d.id = v.doctor_id
     WHERE v.patient_id = ? ORDER BY v.created_at DESC`,
    id,
  );
  const prescriptions = await all(
    env,
    `SELECT rx.*, v.visit_no, s.full_name AS prescribed_by_name
     FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
     LEFT JOIN staff s ON s.id = rx.prescribed_by
     WHERE rx.patient_id = ? ORDER BY rx.prescribed_at DESC LIMIT 20`,
    id,
  );
  const labResults = await all(
    env,
    `SELECT l.*, v.visit_no FROM lab_requests l JOIN visits v ON v.id = l.visit_id
     WHERE l.patient_id = ? AND l.status = 'completed' ORDER BY l.resulted_at DESC LIMIT 20`,
    id,
  );
  return {
    patient: { ...patient, age: ageFromDob(patient.date_of_birth) },
    visits,
    prescriptions,
    lab_results: labResults,
  };
}

async function invoiceDetail(env, id) {
  const invoice = await first(
    env,
    `SELECT i.*, p.full_name AS patient_name, p.patient_no, p.phone AS patient_phone,
            v.visit_no, v.status AS visit_status, v.id AS visit_id
     FROM invoices i JOIN patients p ON p.id = i.patient_id
     JOIN visits v ON v.id = i.visit_id WHERE i.id = ?`,
    id,
  );
  if (!invoice) return null;
  const items = await all(env, 'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at, id', id);
  const payments = await all(
    env,
    `SELECT pay.*, s.full_name AS cashier_name FROM payments pay
     LEFT JOIN staff s ON s.id = pay.received_by
     WHERE pay.invoice_id = ? ORDER BY pay.paid_at`,
    id,
  );
  return { ...invoice, ...(await invoiceTotals(env, id)), items, payments };
}

const money = (pesewas) => `GH₵ ${(pesewas / 100).toFixed(2)}`;

/* --------------------------------- auth ---------------------------------- */

route('GET', /^\/api\/health$/, async ({ env }) => {
  const row = await first(env, 'SELECT COUNT(*) AS c FROM patients');
  return json({ ok: true, time: nowIso(), patients: row ? row.c : 0 });
}, { public: true });

route('POST', /^\/api\/auth\/login$/, async ({ env, body }) => {
  const username = String(body?.username || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!username || !password) fail('Enter your username and password');
  const staff = await first(env, 'SELECT * FROM staff WHERE lower(username) = ?', username);
  if (!staff || !(await verifyPassword(password, staff.password_hash))) {
    throw new ApiError(401, 'Invalid username or password');
  }
  if (!staff.is_active) throw new ApiError(403, 'This account has been deactivated');
  const cookie = await createSession(env, staff.id);
  await run(env, 'UPDATE staff SET last_login_at = ? WHERE id = ?', nowIso(), staff.id);
  await audit(env, staff, 'Signed in', 'session', staff.id);
  return json({ user: publicStaff(staff) }, { headers: { 'Set-Cookie': cookie } });
}, { public: true });

route('POST', /^\/api\/auth\/logout$/, async ({ env, request, staff }) => {
  const cookie = await destroySession(env, request);
  if (staff) await audit(env, staff, 'Signed out', 'session', staff.id);
  return json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
});

route('GET', /^\/api\/auth\/me$/, async ({ staff }) => json({ user: publicStaff(staff) }));

route('POST', /^\/api\/auth\/change-password$/, async ({ env, staff, body }) => {
  if (!(await verifyPassword(String(body?.current_password || ''), staff.password_hash))) {
    fail('Current password is incorrect');
  }
  const next = String(body?.new_password || '');
  if (next.length < 6) fail('New password must be at least 6 characters');
  await run(env, 'UPDATE staff SET password_hash = ? WHERE id = ?', await hashPassword(next), staff.id);
  await audit(env, staff, 'Changed own password', 'staff', staff.id);
  return json({ ok: true });
});

/* ------------------------------- patients -------------------------------- */

route('GET', /^\/api\/patients$/, async ({ env, url }) => {
  const q = String(url.searchParams.get('q') || '').trim();
  const archived = url.searchParams.get('archived') === '1' ? 1 : 0;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await all(
      env,
      `SELECT p.*,
         (SELECT MAX(created_at) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
         (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.id) AS visit_count
       FROM patients p
       WHERE p.archived = ? AND (p.full_name LIKE ? OR p.patient_no LIKE ? OR p.phone LIKE ? OR p.nhis_number LIKE ?)
       ORDER BY p.full_name LIMIT ?`,
      archived,
      like,
      like,
      like,
      like,
      limit,
    );
  } else {
    rows = await all(
      env,
      `SELECT p.*,
         (SELECT MAX(created_at) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
         (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.id) AS visit_count
       FROM patients p WHERE p.archived = ? ORDER BY p.created_at DESC LIMIT ?`,
      archived,
      limit,
    );
  }
  return json({ patients: rows.map((p) => ({ ...p, age: ageFromDob(p.date_of_birth) })) });
}, { perm: 'patients.view' });

route('POST', /^\/api\/patients$/, async ({ env, staff, body }) => {
  requireFields(body, ['full_name', 'gender']);
  if (!['male', 'female', 'other'].includes(body.gender)) fail('Select a valid gender');
  const dob = cleanDate(body.date_of_birth, 'date of birth');
  if (dob && new Date(dob) > new Date()) fail('Date of birth cannot be in the future');
  const phone = cleanPhone(body.phone);
  const emergencyPhone = cleanPhone(body.emergency_phone);
  const nhisStatus = ['active', 'expired', 'none', ''].includes(body.nhis_status) ? body.nhis_status || 'none' : 'none';
  const info = await run(
    env,
    `INSERT INTO patients
     (patient_no, full_name, date_of_birth, gender, phone, address, emergency_name, emergency_phone,
      ghana_card, nhis_number, nhis_status, allergies, conditions, notes, archived, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    await patientNo(env),
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
    staff.id,
    nowIso(),
  );
  const id = Number(info.meta.last_row_id);
  await audit(env, staff, 'Registered patient', 'patient', id, body.full_name);
  return json(await getPatientDetail(env, id), { status: 201 });
}, { perm: 'patients.manage' });

route('GET', /^\/api\/patients\/(\d+)$/, async ({ env, params }) => {
  const detail = await getPatientDetail(env, Number(params[0]));
  if (!detail) fail('Patient not found', 404);
  return json(detail);
}, { perm: 'patients.view' });

route('PATCH', /^\/api\/patients\/(\d+)$/, async ({ env, staff, params, body }) => {
  const id = Number(params[0]);
  const existing = await first(env, 'SELECT * FROM patients WHERE id = ?', id);
  if (!existing) fail('Patient not found', 404);
  const dob = body.date_of_birth !== undefined ? cleanDate(body.date_of_birth, 'date of birth') : existing.date_of_birth;
  const phone = body.phone !== undefined ? cleanPhone(body.phone) : existing.phone;
  const emergencyPhone =
    body.emergency_phone !== undefined ? cleanPhone(body.emergency_phone) : existing.emergency_phone;
  await run(
    env,
    `UPDATE patients SET full_name = ?, date_of_birth = ?, gender = ?, phone = ?, address = ?,
      emergency_name = ?, emergency_phone = ?, ghana_card = ?, nhis_number = ?, nhis_status = ?,
      allergies = ?, conditions = ?, notes = ?, updated_at = ? WHERE id = ?`,
    body.full_name?.trim() || existing.full_name,
    dob,
    body.gender || existing.gender,
    phone,
    body.address !== undefined ? body.address?.trim() || null : existing.address,
    body.emergency_name !== undefined ? body.emergency_name?.trim() || null : existing.emergency_name,
    emergencyPhone,
    body.ghana_card !== undefined ? body.ghana_card?.trim() || null : existing.ghana_card,
    body.nhis_number !== undefined ? body.nhis_number?.trim() || null : existing.nhis_number,
    body.nhis_status || existing.nhis_status,
    body.allergies !== undefined ? body.allergies?.trim() || null : existing.allergies,
    body.conditions !== undefined ? body.conditions?.trim() || null : existing.conditions,
    body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
    nowIso(),
    id,
  );
  await audit(env, staff, 'Updated patient record', 'patient', id, body.full_name || existing.full_name);
  return json(await getPatientDetail(env, id));
}, { perm: 'patients.manage' });

route('POST', /^\/api\/patients\/(\d+)\/archive$/, async ({ env, staff, params }) => {
  if (staff.role !== 'admin') fail('Administrator access required', 403);
  const id = Number(params[0]);
  const existing = await first(env, 'SELECT * FROM patients WHERE id = ?', id);
  if (!existing) fail('Patient not found', 404);
  await run(env, 'UPDATE patients SET archived = 1, updated_at = ? WHERE id = ?', nowIso(), id);
  await audit(env, staff, 'Archived patient record', 'patient', id, existing.full_name);
  return json({ ok: true });
}, { perm: 'patients.manage' });

/* -------------------------------- visits --------------------------------- */

route('GET', /^\/api\/visits$/, async ({ env, url }) => {
  const clauses = [];
  const params = [];
  if (url.searchParams.get('status')) {
    const statuses = String(url.searchParams.get('status')).split(',').filter(Boolean);
    clauses.push(`v.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (url.searchParams.get('patient_id')) {
    clauses.push('v.patient_id = ?');
    params.push(Number(url.searchParams.get('patient_id')));
  }
  if (url.searchParams.get('doctor_id')) {
    clauses.push('v.doctor_id = ?');
    params.push(Number(url.searchParams.get('doctor_id')));
  }
  if (url.searchParams.get('today') === '1') {
    clauses.push('date(v.created_at) = ?');
    params.push(todayStr());
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(env, `${VISIT_SELECT} ${where} ORDER BY v.created_at DESC LIMIT 200`, ...params);
  return json({ visits: rows.map(decorateVisit) });
}, { perm: 'visits.view' });

route('POST', /^\/api\/visits$/, async ({ env, staff, body }) => {
  requireFields(body, ['patient_id', 'reason']);
  const patient = await first(env, 'SELECT * FROM patients WHERE id = ?', Number(body.patient_id));
  if (!patient) fail('Select a registered patient');
  if (patient.archived) fail('This patient record is archived');
  const doctorId = body.doctor_id ? Number(body.doctor_id) : null;
  if (doctorId) {
    const doctor = await first(env, "SELECT * FROM staff WHERE id = ? AND role = 'doctor' AND is_active = 1", doctorId);
    if (!doctor) fail('Select a valid doctor');
  }
  const created = nowIso();
  const vNo = await visitNo(env);
  const info = await run(
    env,
    `INSERT INTO visits (visit_no, patient_id, reason, status, doctor_id, consultation_completed, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'awaiting_nursing', ?, 0, ?, ?, ?)`,
    vNo,
    patient.id,
    String(body.reason).trim(),
    doctorId,
    staff.id,
    created,
    created,
  );
  const visitId = Number(info.meta.last_row_id);
  await run(
    env,
    `INSERT INTO invoices (invoice_no, visit_id, patient_id, total, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 0, 'open', ?, ?, ?)`,
    await invoiceNo(env),
    visitId,
    patient.id,
    staff.id,
    created,
    created,
  );
  await audit(env, staff, 'Created visit', 'visit', visitId, `${vNo} for ${patient.full_name}`);
  return json(await getVisitDetail(env, visitId), { status: 201 });
}, { perm: 'visits.manage' });

route('GET', /^\/api\/visits\/(\d+)$/, async ({ env, params }) => {
  const detail = await getVisitDetail(env, Number(params[0]));
  if (!detail) fail('Visit not found', 404);
  return json(detail);
}, { perm: 'visits.view' });

route('POST', /^\/api\/visits\/(\d+)\/start-consultation$/, async ({ env, staff, params }) => {
  const id = Number(params[0]);
  const detail = await getVisitDetail(env, id);
  if (!detail) fail('Visit not found', 404);
  if (['completed', 'cancelled'].includes(detail.visit.status)) fail('This visit is closed');
  if (!detail.vitals) fail('Vital signs must be recorded by a nurse before consultation');
  await run(env, "UPDATE visits SET status = 'consulting', doctor_id = ?, updated_at = ? WHERE id = ?", staff.id, nowIso(), id);
  await audit(env, staff, 'Started consultation', 'visit', id, detail.visit.visit_no);
  return json(await getVisitDetail(env, id));
}, { perm: 'consultation.manage' });

route('POST', /^\/api\/visits\/(\d+)\/vitals$/, async ({ env, staff, params, body }) => {
  const id = Number(params[0]);
  const visit = await first(env, 'SELECT * FROM visits WHERE id = ?', id);
  if (!visit) fail('Visit not found', 404);
  if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
  if (!body.complaints?.trim()) fail('Record the presenting complaints');
  const systolic = int(body.bp_systolic);
  const diastolic = int(body.bp_diastolic);
  if (systolic !== null && (systolic < 50 || systolic > 300)) fail('Blood pressure systolic looks invalid');
  if (diastolic !== null && (diastolic < 30 || diastolic > 200)) fail('Blood pressure diastolic looks invalid');
  const temp = num(body.temperature);
  if (temp !== null && (temp < 30 || temp > 45)) fail('Temperature must be between 30 and 45 °C');
  const spo2 = int(body.spo2);
  if (spo2 !== null && (spo2 < 50 || spo2 > 100)) fail('SpO2 must be between 50 and 100%');
  const pulse = int(body.pulse);
  if (pulse !== null && (pulse < 20 || pulse > 250)) fail('Pulse rate looks invalid');

  const recorded = nowIso();
  const existing = await first(env, 'SELECT * FROM vitals WHERE visit_id = ?', id);
  if (existing) {
    await run(
      env,
      `UPDATE vitals SET bp_systolic=?, bp_diastolic=?, temperature=?, pulse=?, resp_rate=?, spo2=?,
        weight=?, height=?, glucose=?, complaints=?, recorded_by=?, recorded_at=?, updated_at=? WHERE visit_id=?`,
      systolic,
      diastolic,
      temp,
      pulse,
      int(body.resp_rate),
      spo2,
      num(body.weight),
      num(body.height),
      num(body.glucose),
      body.complaints.trim(),
      staff.id,
      recorded,
      recorded,
      id,
    );
  } else {
    await run(
      env,
      `INSERT INTO vitals (visit_id, bp_systolic, bp_diastolic, temperature, pulse, resp_rate, spo2,
        weight, height, glucose, complaints, recorded_by, recorded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      systolic,
      diastolic,
      temp,
      pulse,
      int(body.resp_rate),
      spo2,
      num(body.weight),
      num(body.height),
      num(body.glucose),
      body.complaints.trim(),
      staff.id,
      recorded,
      recorded,
    );
  }
  if (visit.status === 'awaiting_nursing') {
    await run(env, "UPDATE visits SET status = 'awaiting_doctor', nurse_id = ?, updated_at = ? WHERE id = ?", staff.id, recorded, id);
  }
  await audit(env, staff, existing ? 'Updated vital signs' : 'Recorded vital signs', 'visit', id, visit.visit_no);
  return json(await getVisitDetail(env, id));
}, { perm: 'vitals.manage' });

route('POST', /^\/api\/visits\/(\d+)\/consultation$/, async ({ env, staff, params, body }) => {
  const id = Number(params[0]);
  const visit = await first(env, 'SELECT * FROM visits WHERE id = ?', id);
  if (!visit) fail('Visit not found', 404);
  if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
  const complete = !!body.complete;
  if (complete) {
    if (!String(body.diagnosis || '').trim()) fail('Enter a diagnosis before completing the consultation');
    if (!String(body.clinical_notes || '').trim() && !String(body.symptoms || '').trim()) {
      fail('Record symptoms or clinical notes before completing');
    }
  }
  const doctorId = visit.doctor_id || staff.id;
  const stamp = nowIso();
  const existing = await first(env, 'SELECT * FROM consultations WHERE visit_id = ?', id);
  const serviceId = body.consultation_service_id ? Number(body.consultation_service_id) : null;

  if (existing) {
    await run(
      env,
      `UPDATE consultations SET doctor_id=?, symptoms=?, clinical_notes=?, diagnosis=?, treatment_plan=?,
        follow_up_instructions=?, consultation_service_id=?, completed=?, updated_at=?,
        completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, ?) ELSE completed_at END
       WHERE visit_id=?`,
      doctorId,
      body.symptoms?.trim() || null,
      body.clinical_notes?.trim() || null,
      body.diagnosis?.trim() || null,
      body.treatment_plan?.trim() || null,
      body.follow_up_instructions?.trim() || null,
      serviceId || existing.consultation_service_id,
      complete ? 1 : existing.completed,
      stamp,
      complete ? 1 : 0,
      stamp,
      id,
    );
  } else {
    await run(
      env,
      `INSERT INTO consultations (visit_id, doctor_id, symptoms, clinical_notes, diagnosis, treatment_plan,
        follow_up_instructions, consultation_service_id, completed, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      doctorId,
      body.symptoms?.trim() || null,
      body.clinical_notes?.trim() || null,
      body.diagnosis?.trim() || null,
      body.treatment_plan?.trim() || null,
      body.follow_up_instructions?.trim() || null,
      serviceId,
      complete ? 1 : 0,
      stamp,
      stamp,
      complete ? stamp : null,
    );
  }

  if (visit.status === 'awaiting_doctor') {
    await run(env, "UPDATE visits SET status = 'consulting', doctor_id = ? WHERE id = ?", doctorId, id);
  }

  if (complete) {
    const service = serviceId
      ? await first(env, 'SELECT * FROM services WHERE id = ?', serviceId)
      : await first(env, "SELECT * FROM services WHERE category = 'Consultation' AND active = 1 ORDER BY price LIMIT 1");
    const invoice = await first(env, 'SELECT * FROM invoices WHERE visit_id = ?', id);
    const already = invoice
      ? await first(
          env,
          "SELECT id FROM invoice_items WHERE invoice_id = ? AND source_type = 'consultation' AND status = 'active'",
          invoice.id,
        )
      : null;
    if (invoice && service && !already) {
      await addInvoiceItem(env, {
        invoiceId: invoice.id,
        serviceId: service.id,
        description: service.name,
        category: service.category,
        unitPrice: service.price,
        quantity: 1,
        sourceType: 'consultation',
        sourceId: id,
        staffId: staff.id,
      });
    }
    await run(env, 'UPDATE visits SET consultation_completed = 1, follow_up = ?, updated_at = ? WHERE id = ?', body.follow_up_instructions?.trim() || null, stamp, id);
    await advanceVisit(env, id);
  }
  await audit(env, staff, complete ? 'Completed consultation' : 'Saved consultation draft', 'visit', id, visit.visit_no);
  return json(await getVisitDetail(env, id));
}, { perm: 'consultation.manage' });

route('POST', /^\/api\/visits\/(\d+)\/labs$/, async ({ env, staff, params, body }) => {
  const id = Number(params[0]);
  const visit = await first(env, 'SELECT * FROM visits WHERE id = ?', id);
  if (!visit) fail('Visit not found', 404);
  if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
  const tests = Array.isArray(body?.tests) ? body.tests : [];
  if (!tests.length) fail('Select at least one laboratory test');
  const invoice = await first(env, 'SELECT * FROM invoices WHERE visit_id = ?', id);
  const created = [];
  for (const raw of tests) {
    const serviceId = Number(raw.service_id ?? raw.serviceId ?? raw);
    const service = await first(env, 'SELECT * FROM services WHERE id = ?', serviceId);
    if (!service || !service.active) fail('Select a valid laboratory test');
    if (!['Laboratory', 'Imaging'].includes(service.category)) {
      fail(`${service.name} is not a laboratory or imaging service`);
    }
    const stamp = nowIso();
    const info = await run(
      env,
      `INSERT INTO lab_requests (visit_id, patient_id, service_id, test_name, price, status, requested_by, requested_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      id,
      visit.patient_id,
      service.id,
      service.name,
      service.price,
      staff.id,
      stamp,
    );
    const labId = Number(info.meta.last_row_id);
    let itemId = null;
    if (invoice) {
      itemId = await addInvoiceItem(env, {
        invoiceId: invoice.id,
        serviceId: service.id,
        description: service.name,
        category: service.category,
        unitPrice: service.price,
        quantity: 1,
        sourceType: 'lab',
        sourceId: labId,
        staffId: staff.id,
      });
      await run(env, 'UPDATE lab_requests SET invoice_item_id = ? WHERE id = ?', itemId, labId);
    }
    created.push(labId);
  }
  await audit(env, staff, 'Requested laboratory tests', 'visit', id, `${created.length} test(s) for ${visit.visit_no}`);
  return json({ created, visit: await getVisitDetail(env, id) }, { status: 201 });
}, { perm: 'labs.request' });

route('GET', /^\/api\/visits\/(\d+)\/labs$/, async ({ env, params }) => {
  const rows = await all(
    env,
    `SELECT l.*, p.full_name AS patient_name, p.patient_no, v.visit_no, s.full_name AS requested_by_name,
            r.full_name AS resulted_by_name
     FROM lab_requests l JOIN patients p ON p.id = l.patient_id
     JOIN visits v ON v.id = l.visit_id
     LEFT JOIN staff s ON s.id = l.requested_by
     LEFT JOIN staff r ON r.id = l.resulted_by
     WHERE l.visit_id = ? ORDER BY l.requested_at`,
    Number(params[0]),
  );
  return json({ labs: rows });
}, { perm: 'visits.view' });

route('POST', /^\/api\/visits\/(\d+)\/prescriptions$/, async ({ env, staff, params, body }) => {
  const id = Number(params[0]);
  const visit = await first(env, 'SELECT * FROM visits WHERE id = ?', id);
  if (!visit) fail('Visit not found', 404);
  if (['completed', 'cancelled'].includes(visit.status)) fail('This visit is closed');
  const medication = body.medication_id
    ? await first(env, 'SELECT * FROM medications WHERE id = ?', Number(body.medication_id))
    : null;
  const drugName = String(body.drug_name || medication?.name || '').trim();
  if (!drugName) fail('Select or enter a medication');
  const quantity = Math.max(1, int(body.quantity, 1));
  await run(
    env,
    `INSERT INTO prescriptions (visit_id, patient_id, medication_id, drug_name, dosage, frequency, duration,
      quantity, instructions, status, price, prescribed_by, prescribed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    id,
    visit.patient_id,
    medication?.id ?? null,
    drugName,
    body.dosage?.trim() || null,
    body.frequency?.trim() || null,
    body.duration?.trim() || null,
    quantity,
    body.instructions?.trim() || null,
    medication?.unit_price ?? 0,
    staff.id,
    nowIso(),
  );
  await audit(env, staff, 'Prescribed medication', 'visit', id, `${drugName} × ${quantity}`);
  return json(await getVisitDetail(env, id), { status: 201 });
}, { perm: 'prescriptions.manage' });

route('POST', /^\/api\/visits\/(\d+)\/prescriptions\/(\d+)\/cancel$/, async ({ env, staff, params }) => {
  const visitId = Number(params[0]);
  const rx = await first(env, 'SELECT * FROM prescriptions WHERE id = ? AND visit_id = ?', Number(params[1]), visitId);
  if (!rx) fail('Prescription not found', 404);
  if (rx.status !== 'pending') fail('Only pending prescriptions can be cancelled');
  await run(env, "UPDATE prescriptions SET status = 'cancelled' WHERE id = ?", rx.id);
  if (rx.invoice_item_id) {
    await run(env, "UPDATE invoice_items SET status = 'cancelled' WHERE id = ?", rx.invoice_item_id);
    const item = await first(env, 'SELECT invoice_id FROM invoice_items WHERE id = ?', rx.invoice_item_id);
    if (item) await recalcInvoice(env, item.invoice_id);
  }
  await advanceVisit(env, visitId);
  await audit(env, staff, 'Cancelled prescription', 'prescription', rx.id, rx.drug_name);
  return json(await getVisitDetail(env, visitId));
}, { perm: 'prescriptions.manage' });

/* ------------------------------- laboratory ------------------------------ */

route('GET', /^\/api\/lab$/, async ({ env, url }) => {
  const status = String(url.searchParams.get('status') || 'pending,in_progress').split(',').filter(Boolean);
  const rows = await all(
    env,
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
    ...status,
  );
  return json({ requests: rows });
}, { perm: 'labs.manage' });

route('PATCH', /^\/api\/lab\/(\d+)$/, async ({ env, staff, params, body }) => {
  const lab = await first(env, 'SELECT * FROM lab_requests WHERE id = ?', Number(params[0]));
  if (!lab) fail('Laboratory request not found', 404);
  const status = body.status || lab.status;
  if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) fail('Invalid status');
  if (status === 'completed' && !String(body.result || '').trim()) fail('Enter the test result before completing');
  if (['completed', 'cancelled'].includes(lab.status) && status !== lab.status && staff.role !== 'admin') {
    fail('This request is already closed');
  }
  await run(
    env,
    `UPDATE lab_requests SET status = ?, result = ?, result_notes = ?, resulted_by = ?, resulted_at = ? WHERE id = ?`,
    status,
    status === 'completed' ? String(body.result).trim() : body.result !== undefined ? body.result : lab.result,
    body.result_notes !== undefined ? body.result_notes : lab.result_notes,
    status === 'completed' ? staff.id : lab.resulted_by,
    status === 'completed' ? nowIso() : lab.resulted_at,
    lab.id,
  );
  if (status === 'completed') await advanceVisit(env, lab.visit_id);
  await audit(env, staff, `Laboratory request ${status.replace('_', ' ')}`, 'lab', lab.id, `${lab.test_name} (${lab.visit_id})`);
  return json({ ok: true, status });
}, { perm: 'labs.manage' });

/* -------------------------------- pharmacy ------------------------------- */

route('GET', /^\/api\/pharmacy$/, async ({ env, url }) => {
  const status = String(url.searchParams.get('status') || 'pending');
  const rows = await all(
    env,
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
    status,
  );
  return json({ prescriptions: rows });
}, { perm: 'prescriptions.dispense' });

route('POST', /^\/api\/pharmacy\/(\d+)\/dispense$/, async ({ env, staff, params }) => {
  const rx = await first(env, 'SELECT * FROM prescriptions WHERE id = ?', Number(params[0]));
  if (!rx) fail('Prescription not found', 404);
  if (rx.status !== 'pending') fail('This prescription has already been handled');
  const visit = await first(env, 'SELECT * FROM visits WHERE id = ?', rx.visit_id);
  if (!visit) fail('Visit not found', 404);
  const med = rx.medication_id ? await first(env, 'SELECT * FROM medications WHERE id = ?', rx.medication_id) : null;
  if (med) {
    if (med.stock_qty < rx.quantity) {
      fail(`Insufficient stock for ${med.name}. Available: ${med.stock_qty}, required: ${rx.quantity}`);
    }
    await run(env, 'UPDATE medications SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ?', rx.quantity, nowIso(), med.id);
  }
  const invoice = await first(env, 'SELECT * FROM invoices WHERE visit_id = ?', rx.visit_id);
  let itemId = null;
  if (invoice && rx.price > 0) {
    itemId = await addInvoiceItem(env, {
      invoiceId: invoice.id,
      serviceId: null,
      description: `${rx.drug_name} × ${rx.quantity}${med?.strength ? ` (${med.strength})` : ''}`,
      category: 'Pharmacy',
      unitPrice: rx.price,
      quantity: rx.quantity,
      sourceType: 'pharmacy',
      sourceId: rx.id,
      staffId: staff.id,
    });
  }
  await run(
    env,
    `UPDATE prescriptions SET status = 'dispensed', dispensed_by = ?, dispensed_at = ?, invoice_item_id = ? WHERE id = ?`,
    staff.id,
    nowIso(),
    itemId,
    rx.id,
  );
  await advanceVisit(env, rx.visit_id);
  await audit(env, staff, 'Dispensed medication', 'prescription', rx.id, `${rx.drug_name} × ${rx.quantity}`);
  return json({ ok: true });
}, { perm: 'prescriptions.dispense' });

route('POST', /^\/api\/pharmacy\/(\d+)\/unavailable$/, async ({ env, staff, params, body }) => {
  const rx = await first(env, 'SELECT * FROM prescriptions WHERE id = ?', Number(params[0]));
  if (!rx) fail('Prescription not found', 404);
  if (rx.status !== 'pending') fail('This prescription has already been handled');
  const reason = String(body?.reason || '').trim();
  if (!reason) fail('State why the medication cannot be dispensed');
  await run(
    env,
    "UPDATE prescriptions SET status = 'unavailable', instructions = COALESCE(instructions,'') || ' | Pharmacy: ' || ? WHERE id = ?",
    reason,
    rx.id,
  );
  await advanceVisit(env, rx.visit_id);
  await audit(env, staff, 'Marked medication unavailable', 'prescription', rx.id, reason);
  return json({ ok: true });
}, { perm: 'prescriptions.dispense' });

route('GET', /^\/api\/pharmacy\/inventory\/list$/, async ({ env, staff }) => {
  const role = staff.role;
  if (
    role !== 'admin' &&
    !hasPermission(role, 'medications.manage') &&
    !hasPermission(role, 'prescriptions.manage') &&
    !hasPermission(role, 'prescriptions.dispense')
  ) {
    fail('Your role does not allow this action', 403);
  }
  return json({ medications: await all(env, 'SELECT * FROM medications ORDER BY name') });
});

route('POST', /^\/api\/pharmacy\/inventory\/list$/, async ({ env, staff, body }) => {
  const name = String(body.name || '').trim();
  if (!name) fail('Medication name is required');
  const info = await run(
    env,
    `INSERT INTO medications (name, form, strength, unit_price, stock_qty, reorder_level, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    name,
    body.form?.trim() || null,
    body.strength?.trim() || null,
    Math.max(0, int(body.unit_price, 0)),
    Math.max(0, int(body.stock_qty, 0)),
    Math.max(0, int(body.reorder_level, 10)),
    nowIso(),
    nowIso(),
  );
  const id = Number(info.meta.last_row_id);
  await audit(env, staff, 'Added medication to inventory', 'medication', id, name);
  return json({ id }, { status: 201 });
}, { perm: 'medications.manage' });

route('PATCH', /^\/api\/pharmacy\/inventory\/list\/(\d+)$/, async ({ env, staff, params, body }) => {
  const med = await first(env, 'SELECT * FROM medications WHERE id = ?', Number(params[0]));
  if (!med) fail('Medication not found', 404);
  const stock = body.stock_qty !== undefined ? Math.max(0, int(body.stock_qty, med.stock_qty)) : med.stock_qty;
  await run(
    env,
    `UPDATE medications SET name = ?, form = ?, strength = ?, unit_price = ?, stock_qty = ?, reorder_level = ?,
      active = ?, updated_at = ? WHERE id = ?`,
    body.name?.trim() || med.name,
    body.form !== undefined ? body.form?.trim() || null : med.form,
    body.strength !== undefined ? body.strength?.trim() || null : med.strength,
    body.unit_price !== undefined ? Math.max(0, int(body.unit_price, med.unit_price)) : med.unit_price,
    stock,
    body.reorder_level !== undefined ? Math.max(0, int(body.reorder_level, med.reorder_level)) : med.reorder_level,
    body.active !== undefined ? (body.active ? 1 : 0) : med.active,
    nowIso(),
    med.id,
  );
  await audit(env, staff, 'Updated medication', 'medication', med.id, `${med.name} stock ${med.stock_qty} → ${stock}`);
  return json({ ok: true });
}, { perm: 'medications.manage' });

route('POST', /^\/api\/pharmacy\/inventory\/list\/(\d+)\/restock$/, async ({ env, staff, params, body }) => {
  const med = await first(env, 'SELECT * FROM medications WHERE id = ?', Number(params[0]));
  if (!med) fail('Medication not found', 404);
  const qty = int(body?.quantity, 0);
  if (!qty || qty <= 0) fail('Enter a quantity greater than zero');
  await run(env, 'UPDATE medications SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?', qty, nowIso(), med.id);
  await audit(env, staff, 'Restocked medication', 'medication', med.id, `${med.name} +${qty}`);
  return json({ ok: true, stock_qty: med.stock_qty + qty });
}, { perm: 'medications.manage' });

/* -------------------------------- billing -------------------------------- */

route('GET', /^\/api\/invoices$/, async ({ env, url }) => {
  const q = String(url.searchParams.get('q') || '').trim();
  const like = `%${q}%`;
  const rows = await all(
    env,
    `SELECT i.*, p.full_name AS patient_name, p.patient_no, p.phone,
            v.visit_no, v.status AS visit_status,
            (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active') AS billed,
            (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS paid_amount,
            (SELECT COUNT(*) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS payment_count
     FROM invoices i JOIN patients p ON p.id = i.patient_id
     JOIN visits v ON v.id = i.visit_id
     WHERE (? = '' OR p.full_name LIKE ? OR p.patient_no LIKE ? OR i.invoice_no LIKE ? OR p.phone LIKE ?)
     ORDER BY i.created_at DESC LIMIT 400`,
    q,
    like,
    like,
    like,
    like,
  );
  let list = rows.map((r) => ({ ...r, balance: Math.max((r.billed || 0) - (r.paid_amount || 0), 0) }));
  const filter = String(url.searchParams.get('filter') || 'unpaid');
  if (filter === 'unpaid') list = list.filter((r) => r.balance > 0 && r.status !== 'cancelled');
  else if (filter === 'settled') list = list.filter((r) => r.balance === 0 && (r.billed || 0) > 0);
  else if (filter === 'today') list = list.filter((r) => r.created_at.slice(0, 10) === todayStr());
  return json({ invoices: list.slice(0, 200) });
}, { perm: 'billing.view' });

route('GET', /^\/api\/invoices\/(\d+)$/, async ({ env, params }) => {
  const detail = await invoiceDetail(env, Number(params[0]));
  if (!detail) fail('Invoice not found', 404);
  return json({ invoice: detail });
}, { perm: 'billing.view' });

route('POST', /^\/api\/invoices\/(\d+)\/items$/, async ({ env, staff, params, body }) => {
  const invoice = await first(env, 'SELECT * FROM invoices WHERE id = ?', Number(params[0]));
  if (!invoice) fail('Invoice not found', 404);
  if (invoice.status === 'cancelled') fail('This invoice has been cancelled');
  const service = await first(env, 'SELECT * FROM services WHERE id = ?', Number(body?.service_id));
  if (!service) fail('Select a service');
  if (!service.active) fail('This service is inactive');
  const quantity = Math.max(1, int(body?.quantity, 1));
  await addInvoiceItem(env, {
    invoiceId: invoice.id,
    serviceId: service.id,
    description: service.name,
    category: service.category,
    unitPrice: service.price,
    quantity,
    sourceType: 'manual',
    staffId: staff.id,
  });
  await advanceVisit(env, invoice.visit_id);
  await audit(env, staff, 'Added service to bill', 'invoice', invoice.id, `${service.name} × ${quantity}`);
  return json({ invoice: await invoiceDetail(env, invoice.id) }, { status: 201 });
}, { perm: 'billing.manage' });

route('POST', /^\/api\/invoices\/(\d+)\/payments$/, async ({ env, staff, params, body }) => {
  const invoice = await first(env, 'SELECT * FROM invoices WHERE id = ?', Number(params[0]));
  if (!invoice) fail('Invoice not found', 404);
  if (invoice.status === 'cancelled') fail('This invoice has been cancelled');
  const totals = await invoiceTotals(env, invoice.id);
  if (totals.total === 0) fail('No services have been billed on this visit yet');
  const amount = int(body?.amount);
  if (!amount || amount <= 0) fail('Enter the amount received');
  if (amount > totals.balance) {
    fail(`Amount received (${money(amount)}) is more than the outstanding balance of ${money(totals.balance)}`);
  }
  const method = String(body?.method || '').toLowerCase();
  if (!['cash', 'momo'].includes(method)) fail('Select Cash or Mobile Money as the payment method');
  const reference = body?.momo_reference ? String(body.momo_reference).trim() : null;
  if (reference && reference.length > 60) fail('Mobile Money reference is too long');
  let paidAt = nowIso();
  if (body?.paid_at) {
    const parsed = new Date(body.paid_at);
    if (Number.isNaN(parsed.getTime())) fail('Enter a valid payment date and time');
    if (parsed.getTime() > Date.now() + 5 * 60 * 1000) fail('Payment time cannot be in the future');
    paidAt = parsed.toISOString();
  }
  const duplicate = await first(
    env,
    `SELECT id FROM payments WHERE invoice_id = ? AND amount = ? AND method = ? AND received_by = ?
     AND status = 'confirmed' AND created_at > ?`,
    invoice.id,
    amount,
    method,
    staff.id,
    new Date(Date.now() - 10000).toISOString(),
  );
  if (duplicate) fail('An identical payment was just recorded. Check the payment history.');

  const rNo = await receiptNo(env);
  const info = await run(
    env,
    `INSERT INTO payments (receipt_no, invoice_id, patient_id, amount, method, momo_reference, received_by,
      paid_at, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    rNo,
    invoice.id,
    invoice.patient_id,
    amount,
    method,
    reference,
    staff.id,
    paidAt,
    body?.notes ? String(body.notes).trim() : null,
    nowIso(),
  );
  await recalcInvoice(env, invoice.id);
  await advanceVisit(env, invoice.visit_id);
  await audit(
    env,
    staff,
    'Recorded payment',
    'payment',
    Number(info.meta.last_row_id),
    `${rNo} ${money(amount)} ${method === 'cash' ? 'cash' : 'MoMo'} for ${invoice.invoice_no}`,
  );
  return json(
    {
      payment: await first(env, 'SELECT * FROM payments WHERE id = ?', Number(info.meta.last_row_id)),
      invoice: await invoiceDetail(env, invoice.id),
    },
    { status: 201 },
  );
}, { perm: 'payments.manage' });

route('POST', /^\/api\/payments\/(\d+)\/reverse$/, async ({ env, staff, params, body }) => {
  if (staff.role !== 'admin') fail('Administrator access required', 403);
  const payment = await first(env, 'SELECT * FROM payments WHERE id = ?', Number(params[0]));
  if (!payment) fail('Payment not found', 404);
  if (payment.status !== 'confirmed') fail('This payment has already been reversed');
  const reason = String(body?.reason || '').trim();
  if (!reason) fail('Give a reason for reversing this payment');
  await run(
    env,
    "UPDATE payments SET status = 'reversed', reversed_by = ?, reversed_at = ?, reversal_reason = ? WHERE id = ?",
    staff.id,
    nowIso(),
    reason,
    payment.id,
  );
  await recalcInvoice(env, payment.invoice_id);
  const invoice = await first(env, 'SELECT * FROM invoices WHERE id = ?', payment.invoice_id);
  await advanceVisit(env, invoice.visit_id);
  await audit(
    env,
    staff,
    'Reversed payment',
    'payment',
    payment.id,
    `${payment.receipt_no} ${money(payment.amount)} — ${reason}`,
  );
  return json({ invoice: await invoiceDetail(env, payment.invoice_id) });
}, { admin: true });

route('GET', /^\/api\/payments$/, async ({ env, staff, url }) => {
  if (
    !hasPermission(staff.role, 'payments.manage') &&
    !hasPermission(staff.role, 'finance.view') &&
    !hasPermission(staff.role, 'billing.view')
  ) {
    fail('Your role does not allow this action', 403);
  }
  const clauses = [];
  const params = [];
  const from = url.searchParams.get('from') ? String(url.searchParams.get('from')).slice(0, 10) : null;
  const to = url.searchParams.get('to') ? String(url.searchParams.get('to')).slice(0, 10) : null;
  if (from) {
    clauses.push('pay.paid_at >= ?');
    params.push(`${from}T00:00:00.000Z`);
  }
  if (to) {
    clauses.push('pay.paid_at < ?');
    params.push(addDays(`${to}T00:00:00.000Z`, 1));
  }
  if (url.searchParams.get('method')) {
    clauses.push('pay.method = ?');
    params.push(String(url.searchParams.get('method')));
  }
  if (url.searchParams.get('cashier_id')) {
    clauses.push('pay.received_by = ?');
    params.push(Number(url.searchParams.get('cashier_id')));
  }
  if (url.searchParams.get('patient_id')) {
    clauses.push('pay.patient_id = ?');
    params.push(Number(url.searchParams.get('patient_id')));
  }
  if (url.searchParams.get('status')) {
    clauses.push('pay.status = ?');
    params.push(String(url.searchParams.get('status')));
  }
  const q = String(url.searchParams.get('q') || '').trim();
  if (q) {
    clauses.push('(p.full_name LIKE ? OR p.patient_no LIKE ? OR pay.receipt_no LIKE ? OR pay.momo_reference LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    env,
    `SELECT pay.*, p.full_name AS patient_name, p.patient_no, s.full_name AS cashier_name,
            i.invoice_no, v.visit_no, r.full_name AS reversed_by_name
     FROM payments pay JOIN patients p ON p.id = pay.patient_id
     JOIN invoices i ON i.id = pay.invoice_id
     JOIN visits v ON v.id = i.visit_id
     LEFT JOIN staff s ON s.id = pay.received_by
     LEFT JOIN staff r ON r.id = pay.reversed_by
     ${where} ORDER BY pay.paid_at DESC LIMIT 500`,
    ...params,
  );
  return json({ payments: rows });
});

route('GET', /^\/api\/finance\/summary$/, async ({ env, url }) => {
  const from = String(url.searchParams.get('from') || todayStr()).slice(0, 10);
  const to = String(url.searchParams.get('to') || todayStr()).slice(0, 10);
  const start = `${from}T00:00:00.000Z`;
  const end = addDays(`${to}T00:00:00.000Z`, 1);
  const day = todayStr();
  const monthStart = `${day.slice(0, 7)}-01T00:00:00.000Z`;
  const weekStart = addDays(`${day}T00:00:00.000Z`, -6);

  const sumPayments = async (a, b) =>
    (await first(
      env,
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM payments
       WHERE status='confirmed' AND paid_at >= ? AND paid_at < ?`,
      a,
      b,
    )) || { total: 0, count: 0 };

  const range = await sumPayments(start, end);
  const byMethod = await all(
    env,
    `SELECT method, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM payments
     WHERE status='confirmed' AND paid_at >= ? AND paid_at < ? GROUP BY method`,
    start,
    end,
  );
  const todayTotals = await sumPayments(`${day}T00:00:00.000Z`, addDays(`${day}T00:00:00.000Z`, 1));
  const week = await sumPayments(weekStart, addDays(`${day}T00:00:00.000Z`, 1));
  const month = await sumPayments(monthStart, addDays(`${day}T00:00:00.000Z`, 1));
  const billedInRange = await first(
    env,
    `SELECT COALESCE(SUM(amount),0) AS total FROM invoice_items
     WHERE status='active' AND created_at >= ? AND created_at < ?`,
    start,
    end,
  );
  const outstandingRow = await first(
    env,
    `SELECT COALESCE(SUM(bal),0) AS total, COUNT(*) AS count FROM (
       SELECT (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active')
         - (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS bal
       FROM invoices i WHERE i.status <> 'cancelled'
     ) WHERE bal > 0`,
  );
  const categories = await all(
    env,
    `SELECT category, COALESCE(SUM(amount),0) AS total, COALESCE(SUM(quantity),0) AS quantity
     FROM invoice_items WHERE status='active' AND created_at >= ? AND created_at < ?
     GROUP BY category ORDER BY total DESC`,
    start,
    end,
  );
  const trend = await all(
    env,
    `SELECT substr(paid_at, 1, 10) AS day, method, COALESCE(SUM(amount),0) AS total
     FROM payments WHERE status='confirmed' AND paid_at >= ?
     GROUP BY day, method ORDER BY day`,
    addDays(`${day}T00:00:00.000Z`, -6),
  );
  const topOutstanding = await all(
    env,
    `SELECT p.id, p.full_name, p.patient_no, SUM(bal) AS balance, COUNT(*) AS invoices FROM (
       SELECT i.id, i.patient_id,
         (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active')
         - (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS bal
       FROM invoices i WHERE i.status <> 'cancelled'
     ) x JOIN patients p ON p.id = x.patient_id WHERE x.bal > 0
     GROUP BY p.id ORDER BY balance DESC LIMIT 8`,
  );
  const cashierBreakdown = await all(
    env,
    `SELECT s.id, s.full_name, COALESCE(SUM(pay.amount),0) AS total, COUNT(pay.id) AS count,
            SUM(CASE WHEN pay.method='cash' THEN pay.amount ELSE 0 END) AS cash_total,
            SUM(CASE WHEN pay.method='momo' THEN pay.amount ELSE 0 END) AS momo_total
     FROM payments pay LEFT JOIN staff s ON s.id = pay.received_by
     WHERE pay.status='confirmed' AND pay.paid_at >= ? AND pay.paid_at < ?
     GROUP BY s.id ORDER BY total DESC`,
    start,
    end,
  );

  return json({
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
}, { perm: 'finance.view' });

/* -------------------------------- dashboard ------------------------------ */

route('GET', /^\/api\/dashboard$/, async ({ env }) => {
  const day = todayStr();
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = addDays(dayStart, 1);
  const count = async (sql, ...params) => Number((await first(env, sql, ...params)).c);

  const stats = {
    total_patients: await count('SELECT COUNT(*) AS c FROM patients WHERE archived = 0'),
    new_patients_today: await count('SELECT COUNT(*) AS c FROM patients WHERE date(created_at) = ?', day),
    active_visits: await count("SELECT COUNT(*) AS c FROM visits WHERE status NOT IN ('completed','cancelled')"),
    awaiting_nursing: await count("SELECT COUNT(*) AS c FROM visits WHERE status = 'awaiting_nursing'"),
    awaiting_doctor: await count("SELECT COUNT(*) AS c FROM visits WHERE status = 'awaiting_doctor'"),
    consulting: await count("SELECT COUNT(*) AS c FROM visits WHERE status = 'consulting'"),
    completed_today: await count("SELECT COUNT(*) AS c FROM visits WHERE status = 'completed' AND closed_at >= ?", dayStart),
    pending_labs: await count("SELECT COUNT(*) AS c FROM lab_requests WHERE status IN ('pending','in_progress')"),
    pending_rx: await count("SELECT COUNT(*) AS c FROM prescriptions WHERE status = 'pending'"),
    awaiting_payment: await count("SELECT COUNT(*) AS c FROM visits WHERE status = 'awaiting_payment'"),
    outstanding_total: Number(
      (
        await first(
          env,
          `SELECT COALESCE(SUM(bal),0) AS c FROM (
             SELECT (SELECT COALESCE(SUM(amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.status='active')
               - (SELECT COALESCE(SUM(amount),0) FROM payments pp WHERE pp.invoice_id = i.id AND pp.status='confirmed') AS bal
             FROM invoices i WHERE i.status <> 'cancelled'
           ) WHERE bal > 0`,
        )
      ).c,
    ),
    low_stock: await count('SELECT COUNT(*) AS c FROM medications WHERE active = 1 AND stock_qty <= reorder_level'),
  };

  const revenue = await all(
    env,
    `SELECT method, COALESCE(SUM(amount),0) AS total FROM payments
     WHERE status = 'confirmed' AND paid_at >= ? AND paid_at < ? GROUP BY method`,
    dayStart,
    dayEnd,
  );
  stats.today_revenue = revenue.reduce((sum, r) => sum + r.total, 0);
  stats.today_revenue_split = { cash: 0, momo: 0 };
  for (const r of revenue) stats.today_revenue_split[r.method] = r.total;

  const queue = (statuses) =>
    all(
      env,
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
      ...statuses,
    );

  const labs = await all(
    env,
    `SELECT l.id, l.test_name, l.status, l.requested_at, p.full_name AS patient_name, p.patient_no, v.visit_no
     FROM lab_requests l JOIN patients p ON p.id = l.patient_id JOIN visits v ON v.id = l.visit_id
     WHERE l.status IN ('pending','in_progress') ORDER BY l.requested_at ASC LIMIT 8`,
  );
  const prescriptions = await all(
    env,
    `SELECT rx.id, rx.drug_name, rx.quantity, rx.prescribed_at, p.full_name AS patient_name,
            p.patient_no, v.visit_no
     FROM prescriptions rx JOIN patients p ON p.id = rx.patient_id JOIN visits v ON v.id = rx.visit_id
     WHERE rx.status = 'pending' ORDER BY rx.prescribed_at ASC LIMIT 8`,
  );
  const payments = await all(
    env,
    `SELECT pay.id, pay.receipt_no, pay.amount, pay.method, pay.paid_at, p.full_name AS patient_name,
            s.full_name AS cashier_name
     FROM payments pay JOIN patients p ON p.id = pay.patient_id
     LEFT JOIN staff s ON s.id = pay.received_by
     WHERE pay.status = 'confirmed' AND pay.paid_at >= ? AND pay.paid_at < ?
     ORDER BY pay.paid_at DESC LIMIT 6`,
    dayStart,
    dayEnd,
  );
  const lowStock = await all(
    env,
    `SELECT id, name, form, strength, stock_qty, reorder_level FROM medications
     WHERE active = 1 AND stock_qty <= reorder_level ORDER BY stock_qty LIMIT 6`,
  );

  return json({
    stats,
    queues: {
      nursing: await queue(['awaiting_nursing']),
      doctor: await queue(['awaiting_doctor', 'consulting']),
      awaiting_payment: await queue(['awaiting_payment']),
    },
    labs,
    prescriptions,
    payments,
    low_stock: lowStock,
  });
}, { perm: 'dashboard.view' });

/* ---------------------------------- admin -------------------------------- */

route('GET', /^\/api\/meta$/, async () =>
  json({ roles: ROLE_LABELS, service_categories: SERVICE_CATEGORIES, visit_statuses: VISIT_STATUSES }),
);

route('GET', /^\/api\/staff\/doctors$/, async ({ env }) =>
  json({ doctors: await all(env, "SELECT id, full_name, role FROM staff WHERE role = 'doctor' AND is_active = 1 ORDER BY full_name") }),
);

route('GET', /^\/api\/staff$/, async ({ env }) =>
  json({
    staff: await all(
      env,
      `SELECT id, username, full_name, role, role_label, phone, email, is_active, created_at, last_login_at
       FROM staff ORDER BY full_name`,
    ),
  }),
{ admin: true });

route('POST', /^\/api\/staff$/, async ({ env, staff, body }) => {
  requireFields(body, ['username', 'password', 'full_name', 'role']);
  const username = String(body.username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    fail('Username must be 3–32 characters using letters, numbers, dots, dashes or underscores');
  }
  if (!ROLE_LABELS[body.role]) fail('Select a valid role');
  if (body.role === 'other' && !String(body.role_label || '').trim()) fail('Enter the staff role name');
  if (String(body.password).length < 6) fail('Password must be at least 6 characters');
  const exists = await first(env, 'SELECT id FROM staff WHERE lower(username) = ?', username);
  if (exists) fail('That username is already taken');
  const info = await run(
    env,
    `INSERT INTO staff (username, password_hash, full_name, role, role_label, phone, email, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    username,
    await hashPassword(String(body.password)),
    String(body.full_name).trim(),
    body.role,
    body.role === 'other' ? String(body.role_label).trim() : null,
    cleanPhone(body.phone),
    body.email?.trim() || null,
    nowIso(),
  );
  const id = Number(info.meta.last_row_id);
  await audit(env, staff, 'Created staff account', 'staff', id, `${body.full_name} (${body.role})`);
  return json({ id }, { status: 201 });
}, { admin: true });

route('PATCH', /^\/api\/staff\/(\d+)$/, async ({ env, staff, params, body }) => {
  const member = await first(env, 'SELECT * FROM staff WHERE id = ?', Number(params[0]));
  if (!member) fail('Staff member not found', 404);
  const role = body.role || member.role;
  if (!ROLE_LABELS[role]) fail('Select a valid role');
  if (member.id === staff.id && (role !== 'admin' || body.is_active === false)) {
    fail('You cannot remove your own administrator access');
  }
  if (member.role === 'admin' && role !== 'admin') {
    const admins = await first(env, "SELECT COUNT(*) AS c FROM staff WHERE role='admin' AND is_active=1");
    if (admins.c <= 1) fail('At least one active administrator is required');
  }
  await run(
    env,
    `UPDATE staff SET full_name = ?, role = ?, role_label = ?, phone = ?, email = ?, is_active = ? WHERE id = ?`,
    body.full_name?.trim() || member.full_name,
    role,
    role === 'other' ? body.role_label?.trim() || member.role_label || 'Other staff' : null,
    body.phone !== undefined ? cleanPhone(body.phone) : member.phone,
    body.email !== undefined ? body.email?.trim() || null : member.email,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : member.is_active,
    member.id,
  );
  await audit(env, staff, 'Updated staff account', 'staff', member.id, member.full_name);
  return json({ ok: true });
}, { admin: true });

route('POST', /^\/api\/staff\/(\d+)\/password$/, async ({ env, staff, params, body }) => {
  const member = await first(env, 'SELECT * FROM staff WHERE id = ?', Number(params[0]));
  if (!member) fail('Staff member not found', 404);
  const password = String(body?.password || '');
  if (password.length < 6) fail('Password must be at least 6 characters');
  await run(env, 'UPDATE staff SET password_hash = ? WHERE id = ?', await hashPassword(password), member.id);
  await run(env, 'DELETE FROM sessions WHERE staff_id = ?', member.id);
  await audit(env, staff, 'Reset staff password', 'staff', member.id, member.full_name);
  return json({ ok: true });
}, { admin: true });

route('GET', /^\/api\/services$/, async ({ env, url, staff }) => {
  const canView =
    hasPermission(staff.role, 'services.view') ||
    hasPermission(staff.role, 'billing.view') ||
    hasPermission(staff.role, 'billing.manage') ||
    staff.role === 'lab';
  if (!canView) fail('Your role does not allow this action', 403);
  const allRows = url.searchParams.get('all') === '1' && staff.role === 'admin';
  return json({
    services: await all(
      env,
      `SELECT * FROM services ${allRows ? '' : 'WHERE active = 1'} ORDER BY category, name`,
    ),
  });
});

route('POST', /^\/api\/services$/, async ({ env, staff, body }) => {
  requireFields(body, ['name', 'category', 'price']);
  if (!SERVICE_CATEGORIES.includes(body.category)) fail('Select a valid service category');
  const price = int(body.price);
  if (price === null || price < 0) fail('Enter a valid price');
  const info = await run(
    env,
    `INSERT INTO services (name, category, price, description, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    body.name.trim(),
    body.category,
    price,
    body.description?.trim() || null,
    nowIso(),
    nowIso(),
  );
  const id = Number(info.meta.last_row_id);
  await audit(env, staff, 'Added service', 'service', id, `${body.name} — ${price}`);
  return json({ id }, { status: 201 });
}, { admin: true });

route('PATCH', /^\/api\/services\/(\d+)$/, async ({ env, staff, params, body }) => {
  const service = await first(env, 'SELECT * FROM services WHERE id = ?', Number(params[0]));
  if (!service) fail('Service not found', 404);
  await run(
    env,
    `UPDATE services SET name = ?, category = ?, price = ?, description = ?, active = ?, updated_at = ? WHERE id = ?`,
    body.name?.trim() || service.name,
    SERVICE_CATEGORIES.includes(body.category) ? body.category : service.category,
    body.price !== undefined ? Math.max(0, int(body.price, service.price)) : service.price,
    body.description !== undefined ? body.description?.trim() || null : service.description,
    body.active !== undefined ? (body.active ? 1 : 0) : service.active,
    nowIso(),
    service.id,
  );
  await audit(env, staff, 'Updated service', 'service', service.id, `${service.name}: ${service.price} → ${body.price ?? service.price}`);
  return json({ ok: true });
}, { admin: true });

route('GET', /^\/api\/settings$/, async ({ env }) =>
  json({ settings: await first(env, 'SELECT * FROM settings WHERE id = 1') }),
);

route('PATCH', /^\/api\/settings$/, async ({ env, staff, body }) => {
  const current = await first(env, 'SELECT * FROM settings WHERE id = 1');
  if (!body.name?.trim()) fail('Hospital name is required');
  let logoUrl = body.logo_url !== undefined ? body.logo_url : current?.logo_url;
  if (logoUrl) {
    logoUrl = String(logoUrl);
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(logoUrl)) {
      fail('The logo must be an uploaded PNG, JPEG, WebP or GIF image');
    }
    if (logoUrl.length > 400000) fail('The logo image is too large (maximum 300 KB)');
  } else {
    logoUrl = null;
  }
  await run(
    env,
    `UPDATE settings SET name = ?, address = ?, phone = ?, email = ?, momo_number = ?, logo_text = ?, logo_url = ?, updated_at = ? WHERE id = 1`,
    body.name.trim(),
    body.address?.trim() || null,
    body.phone?.trim() || null,
    body.email?.trim() || null,
    body.momo_number?.trim() || null,
    (body.logo_text?.trim() || current?.logo_text || 'AM').slice(0, 3).toUpperCase(),
    logoUrl,
    nowIso(),
  );
  await audit(env, staff, 'Updated hospital information', 'settings', 1, body.name);
  return json({ settings: await first(env, 'SELECT * FROM settings WHERE id = 1') });
}, { admin: true });

route('GET', /^\/api\/audit$/, async ({ env, url }) => {
  const q = String(url.searchParams.get('q') || '').trim();
  const like = `%${q}%`;
  return json({
    logs: await all(
      env,
      `SELECT * FROM audit_logs
       WHERE (? = '' OR staff_name LIKE ? OR action LIKE ? OR entity LIKE ? OR details LIKE ?)
       ORDER BY created_at DESC LIMIT 300`,
      q,
      like,
      like,
      like,
      like,
    ),
  });
}, { admin: true });

route('GET', /^\/api\/backup$/, async ({ env, staff }) => {
  const tables = [
    'staff',
    'settings',
    'patients',
    'visits',
    'vitals',
    'consultations',
    'lab_requests',
    'prescriptions',
    'medications',
    'services',
    'invoices',
    'invoice_items',
    'payments',
    'audit_logs',
    'counters',
  ];
  const data = {};
  for (const table of tables) {
    data[table] = await all(env, `SELECT * FROM ${table}`);
  }
  await audit(env, staff, 'Downloaded database backup', 'system', null, `${todayStr()}.json`);
  return new Response(JSON.stringify({ exported_at: nowIso(), format: 'adom-hms-json-v1', data }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="hms-backup-${todayStr()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}, { admin: true });
