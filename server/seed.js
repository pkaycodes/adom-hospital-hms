import { db } from './db.js';
import { hashPassword } from './crypto.js';
import {
  addInvoiceItem,
  advanceVisit,
  invoiceNo,
  invoiceTotals,
  nowIso,
  patientNo,
  receiptNo,
  recalcInvoice,
  visitNo,
} from './util.js';

const iso = (offsetMs) => new Date(Date.now() - offsetMs).toISOString();

export function seedIfEmpty() {
  const existing = Number(db.prepare('SELECT COUNT(*) AS c FROM staff').get().c);
  if (existing > 0) return false;

  db.exec('BEGIN');
  try {
    seedAll();
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  }
}

function seedAll() {
  const created = nowIso();
  const insertStaff = db.prepare(
    `INSERT INTO staff (username, password_hash, full_name, role, role_label, phone, email, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  const staffSeed = [
    ['admin', 'Admin@123', 'Akosua Frimpong', 'admin', null, '0244102233', 'admin@adomclinic.com.gh'],
    ['dr.mensah', 'Doctor@123', 'Dr. Kwame Mensah', 'doctor', null, '0245557788', 'k.mensah@adomclinic.com.gh'],
    ['nurse.adu', 'Nurse@123', 'Abena Adu', 'nurse', null, '0207714455', 'a.adu@adomclinic.com.gh'],
    ['cashier.owusu', 'Cashier@123', 'Yaw Owusu', 'cashier', null, '0552201188', 'y.owusu@adomclinic.com.gh'],
    ['pharm.boateng', 'Pharma@123', 'Efua Boateng', 'pharmacist', null, '0263349900', 'e.boateng@adomclinic.com.gh'],
    ['lab.asante', 'Lab@123', 'Kofi Asante', 'lab', null, '0276654321', 'k.asante@adomclinic.com.gh'],
    ['reception', 'Reception@123', 'Adjoa Nyarko', 'receptionist', null, '0302204455', 'reception@adomclinic.com.gh'],
    ['records', 'Records@123', 'Ibrahim Musah', 'other', 'Records Officer', '0249003322', 'records@adomclinic.com.gh'],
  ];
  for (const [username, password, name, role, label, phone, email] of staffSeed) {
    insertStaff.run(username, hashPassword(password), name, role, label, phone, email, created);
  }
  const staffId = (username) => db.prepare('SELECT id FROM staff WHERE username = ?').get(username).id;
  const receptionist = staffId('reception');
  const nurse = staffId('nurse.adu');
  const doctor = staffId('dr.mensah');
  const cashier = staffId('cashier.owusu');
  const pharmacist = staffId('pharm.boateng');
  const labTech = staffId('lab.asante');

  const insertService = db.prepare(
    `INSERT INTO services (name, category, price, description, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  );
  const services = [
    ['General Consultation', 'Consultation', 5000, 'Doctor consultation and clinical assessment'],
    ['Specialist Consultation', 'Consultation', 12000, 'Specialist review'],
    ['Nursing Care', 'Nursing', 3000, 'Nursing assessment and care'],
    ['Injection (IM/IV)', 'Nursing', 1500, 'Administration of injection'],
    ['Wound Dressing', 'Nursing', 4000, 'Cleaning and dressing of wounds'],
    ['Vital Signs Assessment', 'Nursing', 1000, 'Routine observation of vital signs'],
    ['Malaria Rapid Test', 'Laboratory', 3500, 'Malaria RDT'],
    ['Full Blood Count', 'Laboratory', 8000, 'FBC with differential'],
    ['Fasting Blood Sugar', 'Laboratory', 3000, 'Blood glucose'],
    ['Urinalysis', 'Laboratory', 3500, 'Urine dipstick and microscopy'],
    ['Typhoid Test (Widal)', 'Laboratory', 4000, 'Widal test'],
    ['Hepatitis B Screening', 'Laboratory', 5500, 'HBsAg screening'],
    ['HIV Screening', 'Laboratory', 2000, 'Rapid HIV counselling and testing'],
    ['Pregnancy Test', 'Laboratory', 2500, 'Urine hCG'],
    ['Chest X-Ray', 'Imaging', 15000, 'PA chest radiograph'],
    ['Abdominal Ultrasound', 'Imaging', 20000, 'Abdominal and pelvic scan'],
    ['Minor Surgical Procedure', 'Procedure', 25000, 'Minor theatre procedure'],
    ['Admission (per day)', 'Admission', 15000, 'In-patient bed and nursing care per day'],
    ['Pharmacy Dispensing Fee', 'Pharmacy', 500, 'Dispensing and counselling'],
    ['Antenatal Package', 'Other', 8000, 'Antenatal review package'],
  ];
  for (const [name, category, price, description] of services) {
    insertService.run(name, category, price, description, created, created);
  }
  const serviceId = (name) => db.prepare('SELECT id FROM services WHERE name = ?').get(name).id;

  const insertPatient = db.prepare(
    `INSERT INTO patients (patient_no, full_name, date_of_birth, gender, phone, address, emergency_name,
      emergency_phone, ghana_card, nhis_number, nhis_status, allergies, conditions, notes, archived, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  const patients = [
    ['Ama Serwaa', '1992-04-18', 'female', '0245123456', 'House 14, Madina Estates, Accra', 'Kofi Serwaa', '0244987654', 'GHA-102938475-6', 'NHIS-8829104', 'active', 'None known', 'None', 'Banker'],
    ['Kwesi Appiah', '1978-09-02', 'male', '0201234567', '22 Community 9, Tema', 'Adwoa Appiah', '0209988776', 'GHA-445566778-1', 'NHIS-1178233', 'active', 'Penicillin', 'Hypertension', 'On amlodipine'],
    ['Yaa Asante', '1985-12-11', 'female', '0553344556', 'Plot 7, East Legon, Accra', 'Kwabena Asante', '0551122334', 'GHA-778899001-2', 'NHIS-5567211', 'active', 'None known', 'Asthma', 'Uses salbutamol inhaler'],
    ['Kojo Wiredu', '1966-03-25', 'male', '0246778899', '18 Achimota Forest Road, Accra', 'Esi Wiredu', '0246554433', 'GHA-223344556-7', 'NHIS-9933110', 'expired', 'Sulfa drugs', 'Type 2 Diabetes', 'NHIS expired — cash patient'],
    ['Akosua Bonsu', '2001-07-07', 'female', '0278899001', '5 Kaneshie First Light, Accra', 'Grace Bonsu', '0277766554', null, null, 'none', 'None known', 'None', 'Student, no NHIS'],
    ['Nana Yeboah', '1995-01-30', 'male', '0244332211', '31 Adenta Housing Down, Accra', 'Ama Yeboah', '0244221100', 'GHA-667788990-3', 'NHIS-4455661', 'active', 'None known', 'Sickle cell trait', 'Traced for counselling'],
    ['Ewurama Acquah', '2019-06-14', 'female', '0207766554', '12 Nungua Barrier, Accra', 'Mavis Acquah', '0207654321', 'GHA-334455667-8', 'NHIS-7788990', 'active', 'None known', 'Recurrent tonsillitis', 'Paediatric patient'],
    ['Abdul Rahman', '1988-11-05', 'male', '0263344556', '9 Kasoa Ofaakor, Central Region', 'Fatima Rahman', '0263221100', 'GHA-990011223-4', 'NHIS-3322110', 'active', 'None known', 'Peptic ulcer disease', 'Works as driver'],
    ['Mary Tetteh', '1970-08-19', 'female', '0243111222', '3 Dome Pillar 2, Accra', 'Isaac Tetteh', '0243000111', 'GHA-556677889-0', 'NHIS-6611223', 'active', 'Iodine contrast', 'Hypertension, osteoarthritis', 'Hypertension follow-up'],
    ['Selorm Agbeko', '2003-02-22', 'male', '0554433221', '27 Spintex Road, Accra', 'Dela Agbeko', '0554332211', null, null, 'none', 'None known', 'None', 'First visit'],
  ];
  const patientIds = [];
  for (const p of patients) {
    const info = insertPatient.run(
      patientNo(),
      p[0],
      p[1],
      p[2],
      p[3],
      p[4],
      p[5],
      p[6],
      p[7],
      p[8],
      p[9],
      p[10],
      p[11],
      p[12],
      receptionist,
      created,
    );
    patientIds.push(Number(info.lastInsertRowid));
  }

  const insertMedication = db.prepare(
    `INSERT INTO medications (name, form, strength, unit_price, stock_qty, reorder_level, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const medications = [
    ['Paracetamol', 'Tablet', '500mg', 30, 480, 100],
    ['Amoxicillin', 'Capsule', '250mg', 80, 240, 60],
    ['Artemether/Lumefantrine', 'Tablet', '20/120mg', 150, 180, 40],
    ['Metronidazole', 'Tablet', '400mg', 50, 300, 60],
    ['Ibuprofen', 'Tablet', '400mg', 60, 220, 50],
    ['Oral Rehydration Salts', 'Sachet', '20.5g', 200, 140, 40],
    ['Cotrimoxazole', 'Tablet', '480mg', 40, 320, 60],
    ['Diclofenac', 'Tablet', '50mg', 70, 160, 40],
    ['Amlodipine', 'Tablet', '5mg', 90, 90, 40],
    ['Metformin', 'Tablet', '500mg', 50, 150, 40],
    ['Ceftriaxone', 'Injection', '1g', 1200, 24, 20],
    ['Normal Saline', 'Infusion', '500ml', 800, 18, 20],
    ['Ferrous Sulphate', 'Tablet', '200mg', 25, 260, 60],
    ['Folic Acid', 'Tablet', '5mg', 20, 300, 60],
    ['Salbutamol Inhaler', 'Inhaler', '100mcg', 2500, 8, 10],
  ];
  for (const [name, form, strength, price, stock, reorder] of medications) {
    insertMedication.run(name, form, strength, price, stock, reorder, created, created);
  }
  const medId = (name) => db.prepare('SELECT * FROM medications WHERE name = ?').get(name);

  const createVisit = (patientId, reason, doctorId, createdAt) => {
    const info = db
      .prepare(
        `INSERT INTO visits (visit_no, patient_id, reason, status, doctor_id, consultation_completed, created_by, created_at, updated_at)
         VALUES (?, ?, ?, 'awaiting_nursing', ?, 0, ?, ?, ?)`,
      )
      .run(visitNo(new Date(createdAt)), patientId, reason, doctorId, receptionist, createdAt, createdAt);
    const visitId = Number(info.lastInsertRowid);
    const inv = db
      .prepare(
        `INSERT INTO invoices (invoice_no, visit_id, patient_id, total, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, 0, 'open', ?, ?, ?)`,
      )
      .run(invoiceNo(), visitId, patientId, receptionist, createdAt, createdAt);
    return { visitId, invoiceId: Number(inv.lastInsertRowid) };
  };

  const recordVitals = (visitId, at, v) => {
    db.prepare(
      `INSERT INTO vitals (visit_id, bp_systolic, bp_diastolic, temperature, pulse, resp_rate, spo2,
        weight, height, glucose, complaints, recorded_by, recorded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      visitId,
      v.bp_sys,
      v.bp_dia,
      v.temp,
      v.pulse,
      v.resp,
      v.spo2,
      v.weight,
      v.height,
      v.glucose ?? null,
      v.complaints,
      nurse,
      at,
      at,
    );
    db.prepare("UPDATE visits SET status = 'awaiting_doctor', nurse_id = ?, updated_at = ? WHERE id = ?").run(
      nurse,
      at,
      visitId,
    );
  };

  const saveConsultation = ({ visitId, at, data, complete }) => {
    db.prepare(
      `INSERT INTO consultations (visit_id, doctor_id, symptoms, clinical_notes, diagnosis, treatment_plan,
        follow_up_instructions, consultation_service_id, completed, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      visitId,
      doctor,
      data.symptoms,
      data.notes,
      data.diagnosis,
      data.plan || null,
      data.followUp || null,
      null,
      complete ? 1 : 0,
      at,
      at,
      complete ? at : null,
    );
    db.prepare("UPDATE visits SET status = 'consulting', doctor_id = ?, updated_at = ? WHERE id = ?").run(
      doctor,
      at,
      visitId,
    );
    if (complete) {
      const inv = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(visitId);
      addInvoiceItem({
        invoiceId: inv.id,
        serviceId: serviceId('General Consultation'),
        description: 'General Consultation',
        category: 'Consultation',
        unitPrice: 5000,
        quantity: 1,
        sourceType: 'consultation',
        sourceId: visitId,
        staffId: doctor,
      });
      db.prepare(
        'UPDATE visits SET consultation_completed = 1, follow_up = ?, updated_at = ? WHERE id = ?',
      ).run(data.followUp || null, at, visitId);
      advanceVisit(visitId);
    }
  };

  const addLab = (visitId, patientId, testName, at, status = 'pending', result = null) => {
    const service = db.prepare('SELECT * FROM services WHERE name = ?').get(testName);
    const info = db
      .prepare(
        `INSERT INTO lab_requests (visit_id, patient_id, service_id, test_name, price, status, requested_by,
          requested_at, result, resulted_by, resulted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        visitId,
        patientId,
        service.id,
        service.name,
        service.price,
        status,
        doctor,
        at,
        result,
        status === 'completed' ? labTech : null,
        status === 'completed' ? at : null,
      );
    const labId = Number(info.lastInsertRowid);
    const inv = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(visitId);
    const itemId = addInvoiceItem({
      invoiceId: inv.id,
      serviceId: service.id,
      description: service.name,
      category: service.category,
      unitPrice: service.price,
      quantity: 1,
      sourceType: 'lab',
      sourceId: labId,
      staffId: doctor,
    });
    db.prepare('UPDATE lab_requests SET invoice_item_id = ? WHERE id = ?').run(itemId, labId);
    advanceVisit(visitId);
    return labId;
  };

  const addPrescription = (visitId, patientId, medName, qty, at, dosage, frequency, duration) => {
    const med = medId(medName);
    const info = db
      .prepare(
        `INSERT INTO prescriptions (visit_id, patient_id, medication_id, drug_name, dosage, frequency, duration,
          quantity, instructions, status, price, prescribed_by, prescribed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        visitId,
        patientId,
        med.id,
        med.name,
        dosage,
        frequency,
        duration,
        qty,
        'Take as directed',
        med.unit_price,
        doctor,
        at,
      );
    advanceVisit(visitId);
    return Number(info.lastInsertRowid);
  };

  const dispense = (rxId, at) => {
    const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(rxId);
    const med = rx.medication_id
      ? db.prepare('SELECT * FROM medications WHERE id = ?').get(rx.medication_id)
      : null;
    if (med) {
      db.prepare('UPDATE medications SET stock_qty = stock_qty - ? WHERE id = ?').run(rx.quantity, med.id);
    }
    const inv = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(rx.visit_id);
    const itemId = addInvoiceItem({
      invoiceId: inv.id,
      serviceId: null,
      description: `${rx.drug_name} × ${rx.quantity}${med?.strength ? ` (${med.strength})` : ''}`,
      category: 'Pharmacy',
      unitPrice: rx.price,
      quantity: rx.quantity,
      sourceType: 'pharmacy',
      sourceId: rx.id,
      staffId: pharmacist,
    });
    db.prepare(
      `UPDATE prescriptions SET status = 'dispensed', dispensed_by = ?, dispensed_at = ?, invoice_item_id = ? WHERE id = ?`,
    ).run(pharmacist, at, itemId, rx.id);
    advanceVisit(rx.visit_id);
  };

  const pay = (invoiceId, amount, method, at, reference = null) => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    db.prepare(
      `INSERT INTO payments (receipt_no, invoice_id, patient_id, amount, method, momo_reference, received_by,
        paid_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    ).run(receiptNo(), invoiceId, inv.patient_id, amount, method, reference, cashier, at, at);
    recalcInvoice(invoiceId);
    advanceVisit(inv.visit_id);
  };

  /* --------------------------- current visits --------------------------- */

  const nowMin = (m) => iso(m * 60 * 1000);

  // 1. New arrival, waiting for nursing assessment.
  createVisit(patientIds[5], 'General body pains and chills for three days', null, nowMin(25));

  // 2. Vitals recorded, waiting for the doctor.
  const b = createVisit(patientIds[8], 'Headache and elevated blood pressure reading', doctor, nowMin(110));
  recordVitals(b.visitId, nowMin(95), {
    bp_sys: 158,
    bp_dia: 96,
    temp: 36.8,
    pulse: 88,
    resp: 18,
    spo2: 98,
    weight: 74.5,
    height: 1.62,
    complaints: 'Recurrent headaches for two weeks, feels dizzy when standing. Takes amlodipine irregularly.',
  });

  // 3. In consultation (notes saved as draft).
  const c = createVisit(patientIds[0], 'Fever, headache and general weakness', doctor, nowMin(150));
  recordVitals(c.visitId, nowMin(135), {
    bp_sys: 112,
    bp_dia: 74,
    temp: 38.9,
    pulse: 104,
    resp: 20,
    spo2: 97,
    weight: 61.2,
    height: 1.66,
    glucose: 5.4,
    complaints: 'High fever since yesterday, severe headache, no vomiting. Has not taken any medication.',
  });
  saveConsultation({
    visitId: c.visitId,
    at: nowMin(40),
    data: {
      symptoms: 'Fever 38.9°C, headache, malaise. No cough, no rash.',
      notes: 'Alert and hydrated. Chest clear. Abdomen soft, non-tender. No neck stiffness.',
      diagnosis: '',
    },
    complete: false,
  });

  // 4. Awaiting laboratory results.
  const d = createVisit(patientIds[2], 'Fever with chills and cough', doctor, nowMin(240));
  recordVitals(d.visitId, nowMin(225), {
    bp_sys: 104,
    bp_dia: 68,
    temp: 39.2,
    pulse: 110,
    resp: 24,
    spo2: 96,
    weight: 55.8,
    height: 1.59,
    complaints: 'Fever and chills for two days, dry cough, body weakness.',
  });
  saveConsultation({
    visitId: d.visitId,
    at: nowMin(180),
    data: {
      symptoms: 'Fever, chills, dry cough, anorexia.',
      notes: 'Febrile, chest clear, no consolidation. Mild pharyngeal congestion.',
      diagnosis: 'Suspected malaria with upper respiratory tract infection',
      plan: 'Investigate malaria and full blood count. Analgesia and oral fluids.',
      followUp: 'Review with laboratory results today.',
    },
    complete: true,
  });
  addLab(d.visitId, patientIds[2], 'Malaria Rapid Test', nowMin(170), 'pending');
  addLab(d.visitId, patientIds[2], 'Full Blood Count', nowMin(170), 'in_progress');

  // 5. Awaiting pharmacy (labs completed).
  const e = createVisit(patientIds[7], 'Stomach pain and diarrhoea', doctor, nowMin(330));
  recordVitals(e.visitId, nowMin(315), {
    bp_sys: 118,
    bp_dia: 76,
    temp: 37.4,
    pulse: 92,
    resp: 18,
    spo2: 99,
    weight: 68.0,
    height: 1.75,
    complaints: 'Watery stools four times today, mild abdominal cramps, no blood in stool.',
  });
  saveConsultation({
    visitId: e.visitId,
    at: nowMin(260),
    data: {
      symptoms: 'Acute watery diarrhoea, abdominal cramps, no vomiting.',
      notes: 'Mildly dehydrated, abdomen soft and non-tender. No guarding.',
      diagnosis: 'Acute gastroenteritis — suspected typhoid',
      plan: 'Widal test, oral rehydration, antibiotics.',
      followUp: 'Return if symptoms persist beyond 3 days.',
    },
    complete: true,
  });
  addLab(e.visitId, patientIds[7], 'Typhoid Test (Widal)', nowMin(250), 'completed', 'Widal O 1:160, H 1:160 — suggestive of typhoid');
  addPrescription(e.visitId, patientIds[7], 'Amoxicillin', 21, nowMin(240), '500mg', 'Three times daily', '7 days');
  addPrescription(e.visitId, patientIds[7], 'Metronidazole', 21, nowMin(240), '400mg', 'Three times daily', '7 days');

  // 6. Awaiting payment, partially paid.
  const f = createVisit(patientIds[1], 'Hypertension review and refill', doctor, nowMin(420));
  recordVitals(f.visitId, nowMin(405), {
    bp_sys: 148,
    bp_dia: 94,
    temp: 36.5,
    pulse: 79,
    resp: 16,
    spo2: 99,
    weight: 81.3,
    height: 1.71,
    complaints: 'Runs out of amlodipine, occasional morning headaches. No chest pain.',
  });
  saveConsultation({
    visitId: f.visitId,
    at: nowMin(360),
    data: {
      symptoms: 'Occasional morning headaches. Adherent to medication for the past month.',
      notes: 'BP 148/94. Heart sounds normal, no pedal oedema. Chest clear.',
      diagnosis: 'Essential hypertension — suboptimal control',
      plan: 'Continue amlodipine, lifestyle counselling, review in 4 weeks.',
      followUp: 'Review in 4 weeks with BP diary.',
    },
    complete: true,
  });
  addLab(f.visitId, patientIds[1], 'Full Blood Count', nowMin(350), 'completed', 'Hb 13.4 g/dL, WBC 6.8 ×10⁹/L, Platelets 240 ×10⁹/L — normal');
  const rxAm = addPrescription(f.visitId, patientIds[1], 'Amlodipine', 30, nowMin(345), '5mg', 'Once daily at night', '30 days');
  dispense(rxAm, nowMin(300));
  pay(f.invoiceId, 10000, 'cash', nowMin(240));

  // 7. Completed today, fully paid (cash + MoMo).
  const g = createVisit(patientIds[3], 'Fever and joint pains', doctor, nowMin(600));
  recordVitals(g.visitId, nowMin(585), {
    bp_sys: 132,
    bp_dia: 84,
    temp: 38.4,
    pulse: 96,
    resp: 19,
    spo2: 98,
    weight: 72.4,
    height: 1.68,
    glucose: 7.8,
    complaints: 'Fever, joint pains and fatigue for three days. Known diabetic.',
  });
  saveConsultation({
    visitId: g.visitId,
    at: nowMin(540),
    data: {
      symptoms: 'Fever, generalized joint pains, fatigue.',
      notes: 'Febrile, joints not swollen. Random glucose 7.8 mmol/L.',
      diagnosis: 'Malaria',
      plan: 'Malaria RDT, artemether/lumefantrine, paracetamol. Continue metformin.',
      followUp: 'Review in 1 week if fever persists.',
    },
    complete: true,
  });
  addLab(g.visitId, patientIds[3], 'Malaria Rapid Test', nowMin(530), 'completed', 'Malaria RDT: positive (Pf)');
  const rxArt = addPrescription(g.visitId, patientIds[3], 'Artemether/Lumefantrine', 24, nowMin(525), '20/120mg', 'Twice daily', '3 days');
  const rxPcm = addPrescription(g.visitId, patientIds[3], 'Paracetamol', 10, nowMin(524), '500mg', 'Three times daily', '3 days');
  dispense(rxArt, nowMin(500));
  dispense(rxPcm, nowMin(500));
  const gTotal = invoiceTotals(g.invoiceId).balance;
  pay(g.invoiceId, 6000, 'momo', nowMin(480), 'MP240913.1422.A88210');
  pay(g.invoiceId, gTotal - 6000, 'cash', nowMin(475));

  // 8. Older completed visit (3 days ago) paid by MoMo.
  const old = createVisit(patientIds[6], 'Ear pain and fever', doctor, iso(3 * 86400000 + 4 * 3600000));
  recordVitals(old.visitId, iso(3 * 86400000 + 3.8 * 3600000), {
    bp_sys: 96,
    bp_dia: 62,
    temp: 38.1,
    pulse: 112,
    resp: 22,
    spo2: 98,
    weight: 24.5,
    height: 1.18,
    complaints: 'Right ear pain and fever for two days, reduced appetite.',
  });
  saveConsultation({
    visitId: old.visitId,
    at: iso(3 * 86400000 + 3.5 * 3600000),
    data: {
      symptoms: 'Right ear pain, fever, poor appetite.',
      notes: 'Right tympanic membrane erythematous. No discharge. Throat mildly inflamed.',
      diagnosis: 'Acute otitis media',
      plan: 'Amoxicillin syrup, paracetamol, review in 5 days.',
      followUp: 'Review in 5 days or earlier if pain worsens.',
    },
    complete: true,
  });
  const rxAmox = addPrescription(old.visitId, patientIds[6], 'Amoxicillin', 15, iso(3 * 86400000 + 3.4 * 3600000), '250mg', 'Three times daily', '5 days');
  dispense(rxAmox, iso(3 * 86400000 + 3.3 * 3600000));
  const oldTotal = invoiceTotals(old.invoiceId).balance;
  pay(old.invoiceId, oldTotal, 'momo', iso(3 * 86400000 + 3.2 * 3600000), 'MP240910.0918.B12940');
  shiftVisit(old.visitId, 3);

  // 9. Visit from last week, paid cash.
  const lastWeek = createVisit(patientIds[9], 'Sprained ankle after a fall', null, iso(9 * 86400000 + 5 * 3600000));
  recordVitals(lastWeek.visitId, iso(9 * 86400000 + 4.8 * 3600000), {
    bp_sys: 122,
    bp_dia: 78,
    temp: 36.7,
    pulse: 76,
    resp: 16,
    spo2: 99,
    weight: 66.9,
    height: 1.78,
    complaints: 'Twisted right ankle yesterday, painful and slightly swollen.',
  });
  saveConsultation({
    visitId: lastWeek.visitId,
    at: iso(9 * 86400000 + 4.5 * 3600000),
    data: {
      symptoms: 'Right ankle pain and swelling after a fall.',
      notes: 'Mild lateral malleolar swelling, no bony tenderness, range of movement limited by pain.',
      diagnosis: 'Ankle sprain',
      plan: 'Dressing, analgesia, rest and elevation.',
      followUp: 'Return if swelling or pain worsens.',
    },
    complete: true,
  });
  const invLW = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(lastWeek.visitId);
  addInvoiceItem({
    invoiceId: invLW.id,
    serviceId: serviceId('Wound Dressing'),
    description: 'Wound Dressing',
    category: 'Nursing',
    unitPrice: 4000,
    quantity: 1,
    sourceType: 'service',
    staffId: nurse,
  });
  addInvoiceItem({
    invoiceId: invLW.id,
    serviceId: serviceId('Chest X-Ray'),
    description: 'Ankle X-Ray (film)',
    category: 'Imaging',
    unitPrice: 15000,
    quantity: 1,
    sourceType: 'service',
    staffId: doctor,
  });
  pay(invLW.id, invoiceTotals(invLW.id).balance, 'cash', iso(9 * 86400000 + 4 * 3600000));
  shiftVisit(lastWeek.visitId, 9);

  // Spread a few registration dates so the patient list looks lived-in.
  db.prepare('UPDATE patients SET created_at = ? WHERE id = ?').run(iso(30 * 86400000), patientIds[0]);
  db.prepare('UPDATE patients SET created_at = ? WHERE id = ?').run(iso(20 * 86400000), patientIds[2]);
  db.prepare('UPDATE patients SET created_at = ? WHERE id = ?').run(iso(12 * 86400000), patientIds[7]);
  db.prepare('UPDATE patients SET created_at = ? WHERE id = ?').run(iso(2 * 86400000), patientIds[5]);
}

/** Move every timestamp belonging to a visit back in time (used for sample history). */
function shiftVisit(visitId, days) {
  const ms = days * 86400000;
  const shift = (value) => (value ? new Date(new Date(value).getTime() - ms).toISOString() : null);

  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(visitId);
  db.prepare('UPDATE visits SET created_at = ?, updated_at = ?, closed_at = ? WHERE id = ?').run(
    shift(visit.created_at),
    shift(visit.updated_at),
    shift(visit.closed_at),
    visitId,
  );

  const vitals = db.prepare('SELECT id, recorded_at, updated_at FROM vitals WHERE visit_id = ?').get(visitId);
  if (vitals) {
    db.prepare('UPDATE vitals SET recorded_at = ?, updated_at = ? WHERE id = ?').run(
      shift(vitals.recorded_at),
      shift(vitals.updated_at),
      vitals.id,
    );
  }

  const consult = db
    .prepare('SELECT id, created_at, updated_at, completed_at FROM consultations WHERE visit_id = ?')
    .get(visitId);
  if (consult) {
    db.prepare('UPDATE consultations SET created_at = ?, updated_at = ?, completed_at = ? WHERE id = ?').run(
      shift(consult.created_at),
      shift(consult.updated_at),
      shift(consult.completed_at),
      consult.id,
    );
  }

  for (const lab of db
    .prepare('SELECT id, requested_at, resulted_at FROM lab_requests WHERE visit_id = ?')
    .all(visitId)) {
    db.prepare('UPDATE lab_requests SET requested_at = ?, resulted_at = ? WHERE id = ?').run(
      shift(lab.requested_at),
      shift(lab.resulted_at),
      lab.id,
    );
  }

  for (const rx of db
    .prepare('SELECT id, prescribed_at, dispensed_at FROM prescriptions WHERE visit_id = ?')
    .all(visitId)) {
    db.prepare('UPDATE prescriptions SET prescribed_at = ?, dispensed_at = ? WHERE id = ?').run(
      shift(rx.prescribed_at),
      shift(rx.dispensed_at),
      rx.id,
    );
  }

  const invoice = db
    .prepare('SELECT id, created_at, updated_at FROM invoices WHERE visit_id = ?')
    .get(visitId);
  if (invoice) {
    db.prepare('UPDATE invoices SET created_at = ?, updated_at = ? WHERE id = ?').run(
      shift(invoice.created_at),
      shift(invoice.updated_at),
      invoice.id,
    );
    for (const item of db
      .prepare('SELECT id, created_at FROM invoice_items WHERE invoice_id = ?')
      .all(invoice.id)) {
      db.prepare('UPDATE invoice_items SET created_at = ? WHERE id = ?').run(shift(item.created_at), item.id);
    }
    for (const payment of db
      .prepare('SELECT id, paid_at, created_at FROM payments WHERE invoice_id = ?')
      .all(invoice.id)) {
      db.prepare('UPDATE payments SET paid_at = ?, created_at = ? WHERE id = ?').run(
        shift(payment.paid_at),
        shift(payment.created_at),
        payment.id,
      );
    }
  }
}
