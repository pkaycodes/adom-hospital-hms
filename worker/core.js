/* Core utilities for the Cloudflare Worker build of the hospital system. */

export const ROLE_LABELS = {
  admin: 'Administrator',
  doctor: 'Doctor',
  nurse: 'Nurse',
  cashier: 'Cashier',
  pharmacist: 'Pharmacist',
  lab: 'Laboratory Technician',
  receptionist: 'Receptionist',
  other: 'Other staff',
};

export const ROLE_PERMISSIONS = {
  admin: ['*'],
  doctor: [
    'dashboard.view',
    'patients.view',
    'visits.view',
    'consultation.manage',
    'labs.request',
    'prescriptions.manage',
    'billing.view',
    'services.view',
  ],
  nurse: ['dashboard.view', 'patients.view', 'visits.view', 'vitals.manage'],
  cashier: [
    'dashboard.view',
    'patients.view',
    'visits.view',
    'billing.view',
    'billing.manage',
    'payments.manage',
    'finance.view',
  ],
  pharmacist: ['dashboard.view', 'patients.view', 'visits.view', 'prescriptions.dispense', 'medications.manage'],
  lab: ['dashboard.view', 'patients.view', 'visits.view', 'labs.manage'],
  receptionist: ['dashboard.view', 'patients.view', 'patients.manage', 'visits.manage', 'visits.view', 'billing.view'],
  other: ['dashboard.view', 'patients.view', 'patients.manage', 'visits.manage', 'visits.view'],
};

export const SERVICE_CATEGORIES = [
  'Consultation',
  'Nursing',
  'Laboratory',
  'Imaging',
  'Procedure',
  'Admission',
  'Pharmacy',
  'Other',
];

export const VISIT_STATUSES = {
  awaiting_nursing: 'Waiting for nursing',
  awaiting_doctor: 'Waiting for doctor',
  consulting: 'In consultation',
  awaiting_lab: 'Awaiting laboratory',
  awaiting_pharmacy: 'Awaiting pharmacy',
  awaiting_payment: 'Awaiting payment',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.other;
}

export function hasPermission(role, permission) {
  const perms = permissionsFor(role);
  return perms.includes('*') || perms.includes(permission);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (message, status = 400) => {
  throw new ApiError(status, message);
};

export const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });

export const nowIso = () => new Date().toISOString();
export const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
export const pad = (n, len) => String(n).padStart(len, '0');

/* ------------------------------- database -------------------------------- */

const cleanParams = (params) =>
  params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });

export async function all(env, sql, ...params) {
  const { results } = await env.DB.prepare(sql)
    .bind(...cleanParams(params))
    .all();
  return results || [];
}

export async function first(env, sql, ...params) {
  return env.DB.prepare(sql)
    .bind(...cleanParams(params))
    .first();
}

export async function run(env, sql, ...params) {
  return env.DB.prepare(sql)
    .bind(...cleanParams(params))
    .run();
}

/* -------------------------------- schema --------------------------------- */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  role_label TEXT,
  phone TEXT,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  staff_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  momo_number TEXT,
  logo_text TEXT,
  logo_url TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  phone TEXT,
  address TEXT,
  emergency_name TEXT,
  emergency_phone TEXT,
  ghana_card TEXT,
  nhis_number TEXT,
  nhis_status TEXT NOT NULL DEFAULT 'none',
  allergies TEXT,
  conditions TEXT,
  notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_no TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  doctor_id INTEGER,
  nurse_id INTEGER,
  consultation_completed INTEGER NOT NULL DEFAULT 0,
  follow_up TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL UNIQUE,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  temperature REAL,
  pulse INTEGER,
  resp_rate INTEGER,
  spo2 INTEGER,
  weight REAL,
  height REAL,
  glucose REAL,
  complaints TEXT,
  recorded_by INTEGER,
  recorded_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL UNIQUE,
  doctor_id INTEGER,
  symptoms TEXT,
  clinical_notes TEXT,
  diagnosis TEXT,
  treatment_plan TEXT,
  follow_up_instructions TEXT,
  consultation_service_id INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS lab_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  service_id INTEGER,
  test_name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by INTEGER,
  requested_at TEXT NOT NULL,
  result TEXT,
  result_notes TEXT,
  resulted_by INTEGER,
  resulted_at TEXT,
  invoice_item_id INTEGER
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  medication_id INTEGER,
  drug_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  duration TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  price INTEGER NOT NULL DEFAULT 0,
  prescribed_by INTEGER,
  prescribed_at TEXT NOT NULL,
  dispensed_by INTEGER,
  dispensed_at TEXT,
  invoice_item_id INTEGER
);

CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  form TEXT,
  strength TEXT,
  unit_price INTEGER NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  visit_id INTEGER NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  service_id INTEGER,
  description TEXT NOT NULL,
  category TEXT,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount INTEGER NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL UNIQUE,
  invoice_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  momo_reference TEXT,
  received_by INTEGER,
  paid_at TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  reversed_by INTEGER,
  reversed_at TEXT,
  reversal_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER,
  staff_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_labs_visit ON lab_requests(visit_id);
CREATE INDEX IF NOT EXISTS idx_rx_visit ON prescriptions(visit_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`;

const at = (daysAgo = 0, minutesAgo = 0) =>
  `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${daysAgo * 1440 + minutesAgo} minutes')`;

const SEED = `
INSERT OR REPLACE INTO staff (id, username, password_hash, full_name, role, role_label, phone, email, is_active, created_at) VALUES
 (1,'admin','pbkdf2$100000$8f740af8ecad0733cf25faa8d17635e6$839fdbf1ec14c3f8bd5e1e2a750a239577fff48aa971df4775a10b024944ac4a','Akosua Frimpong','admin',NULL,'0244102233','admin@adomclinic.com.gh',1,${at(60)}),
 (2,'dr.mensah','pbkdf2$100000$a62629a63321521ef720bc1aeeab6e37$2699965f30a6d96f808f70f7b964e59a131f0bb4060f7fc1b528e6350ab95a8a','Dr. Kwame Mensah','doctor',NULL,'0245557788','k.mensah@adomclinic.com.gh',1,${at(60)}),
 (3,'nurse.adu','pbkdf2$100000$c2f384bd40a0d75c071c3732a1c05467$0ebbf20abf61c61dbabc9f319ae8490fcee95b5b78538cf4c18798583f728707','Abena Adu','nurse',NULL,'0207714455','a.adu@adomclinic.com.gh',1,${at(60)}),
 (4,'cashier.owusu','pbkdf2$100000$d3276ecd6940bfcaffe7552a162db935$be0fd9f0edfedcfa6e28b418b1ab5cd820be2049a7eba12f38dec01c95288ad1','Yaw Owusu','cashier',NULL,'0552201188','y.owusu@adomclinic.com.gh',1,${at(60)}),
 (5,'pharm.boateng','pbkdf2$100000$ca8a0ac169d56dffafa54d4101fe72b8$20e4b0e0d2d687ab35846a58c06ce97718894e86d715a5201f89012d864a1484','Efua Boateng','pharmacist',NULL,'0263349900','e.boateng@adomclinic.com.gh',1,${at(60)}),
 (6,'lab.asante','pbkdf2$100000$8ed86089a3de13603babb6a0a4b83006$162e5228bdf294ad26aed98db198cc72658e0654f0c182c0b1377367267e5548','Kofi Asante','lab',NULL,'0276654321','k.asante@adomclinic.com.gh',1,${at(60)}),
 (7,'reception','pbkdf2$100000$9f4528add19325c87bc2568aee5eac48$57f616fa40ec7c8c5772c5d569fe72560d4fe7278a9d621415d661eda32b5adf','Adjoa Nyarko','receptionist',NULL,'0302204455','reception@adomclinic.com.gh',1,${at(60)}),
 (8,'records','pbkdf2$100000$07b80eb096e8b27f41dc0143ec59ce83$679d9da0fd005f39533e92e20f008224a81319be6a1adc90c633c14bf83f16f1','Ibrahim Musah','other','Records Officer','0249003322','records@adomclinic.com.gh',1,${at(60)});

INSERT OR IGNORE INTO settings (id, name, address, phone, email, momo_number, logo_text, logo_url, updated_at)
VALUES (1,'Adom Memorial Clinic','12 Ring Road Central, Accra, Greater Accra','0302 555 120','info@adomclinic.com.gh','024 555 0120','AM',NULL,${at(60)});

INSERT OR IGNORE INTO services (id, name, category, price, description, active, created_at, updated_at) VALUES
 (1,'General Consultation','Consultation',5000,'Doctor consultation and clinical assessment',1,${at(60)},${at(60)}),
 (2,'Specialist Consultation','Consultation',12000,'Specialist review',1,${at(60)},${at(60)}),
 (3,'Nursing Care','Nursing',3000,'Nursing assessment and care',1,${at(60)},${at(60)}),
 (4,'Injection (IM/IV)','Nursing',1500,'Administration of injection',1,${at(60)},${at(60)}),
 (5,'Wound Dressing','Nursing',4000,'Cleaning and dressing of wounds',1,${at(60)},${at(60)}),
 (6,'Vital Signs Assessment','Nursing',1000,'Routine observation of vital signs',1,${at(60)},${at(60)}),
 (7,'Malaria Rapid Test','Laboratory',3500,'Malaria RDT',1,${at(60)},${at(60)}),
 (8,'Full Blood Count','Laboratory',8000,'FBC with differential',1,${at(60)},${at(60)}),
 (9,'Fasting Blood Sugar','Laboratory',3000,'Blood glucose',1,${at(60)},${at(60)}),
 (10,'Urinalysis','Laboratory',3500,'Urine dipstick and microscopy',1,${at(60)},${at(60)}),
 (11,'Typhoid Test (Widal)','Laboratory',4000,'Widal test',1,${at(60)},${at(60)}),
 (12,'Hepatitis B Screening','Laboratory',5500,'HBsAg screening',1,${at(60)},${at(60)}),
 (13,'HIV Screening','Laboratory',2000,'Rapid HIV counselling and testing',1,${at(60)},${at(60)}),
 (14,'Pregnancy Test','Laboratory',2500,'Urine hCG',1,${at(60)},${at(60)}),
 (15,'Chest X-Ray','Imaging',15000,'PA chest radiograph',1,${at(60)},${at(60)}),
 (16,'Abdominal Ultrasound','Imaging',20000,'Abdominal and pelvic scan',1,${at(60)},${at(60)}),
 (17,'Minor Surgical Procedure','Procedure',25000,'Minor theatre procedure',1,${at(60)},${at(60)}),
 (18,'Admission (per day)','Admission',15000,'In-patient bed and nursing care per day',1,${at(60)},${at(60)}),
 (19,'Pharmacy Dispensing Fee','Pharmacy',500,'Dispensing and counselling',1,${at(60)},${at(60)}),
 (20,'Antenatal Package','Other',8000,'Antenatal review package',1,${at(60)},${at(60)});

INSERT OR IGNORE INTO patients (id, patient_no, full_name, date_of_birth, gender, phone, address, emergency_name, emergency_phone, ghana_card, nhis_number, nhis_status, allergies, conditions, notes, archived, created_by, created_at) VALUES
 (1,'GH-0001','Ama Serwaa','1992-04-18','female','0245123456','House 14, Madina Estates, Accra','Kofi Serwaa','0244987654','GHA-102938475-6','NHIS-8829104','active','None known','None','Banker',0,7,${at(30)}),
 (2,'GH-0002','Kwesi Appiah','1978-09-02','male','0201234567','22 Community 9, Tema','Adwoa Appiah','0209988776','GHA-445566778-1','NHIS-1178233','active','Penicillin','Hypertension','On amlodipine',0,7,${at(60)}),
 (3,'GH-0003','Yaa Asante','1985-12-11','female','0553344556','Plot 7, East Legon, Accra','Kwabena Asante','0551122334','GHA-778899001-2','NHIS-5567211','active','None known','Asthma','Uses salbutamol inhaler',0,7,${at(20)}),
 (4,'GH-0004','Kojo Wiredu','1966-03-25','male','0246778899','18 Achimota Forest Road, Accra','Esi Wiredu','0246554433','GHA-223344556-7','NHIS-9933110','expired','Sulfa drugs','Type 2 Diabetes','NHIS expired - cash patient',0,7,${at(60)}),
 (5,'GH-0005','Akosua Bonsu','2001-07-07','female','0278899001','5 Kaneshie First Light, Accra','Grace Bonsu','0277766554',NULL,NULL,'none','None known','None','Student, no NHIS',0,7,${at(60)}),
 (6,'GH-0006','Nana Yeboah','1995-01-30','male','0244332211','31 Adenta Housing Down, Accra','Ama Yeboah','0244221100','GHA-667788990-3','NHIS-4455661','active','None known','Sickle cell trait','Traced for counselling',0,7,${at(2)}),
 (7,'GH-0007','Ewurama Acquah','2019-06-14','female','0207766554','12 Nungua Barrier, Accra','Mavis Acquah','0207654321','GHA-334455667-8','NHIS-7788990','active','None known','Recurrent tonsillitis','Paediatric patient',0,7,${at(60)}),
 (8,'GH-0008','Abdul Rahman','1988-11-05','male','0263344556','9 Kasoa Ofaakor, Central Region','Fatima Rahman','0263221100','GHA-990011223-4','NHIS-3322110','active','None known','Peptic ulcer disease','Works as driver',0,7,${at(12)}),
 (9,'GH-0009','Mary Tetteh','1970-08-19','female','0243111222','3 Dome Pillar 2, Accra','Isaac Tetteh','0243000111','GHA-556677889-0','NHIS-6611223','active','Iodine contrast','Hypertension, osteoarthritis','Hypertension follow-up',0,7,${at(60)}),
 (10,'GH-0010','Selorm Agbeko','2003-02-22','male','0554433221','27 Spintex Road, Accra','Dela Agbeko','0554332211',NULL,NULL,'none','None known','None','First visit',0,7,${at(4)});

INSERT OR IGNORE INTO medications (id, name, form, strength, unit_price, stock_qty, reorder_level, active, created_at, updated_at) VALUES
 (1,'Paracetamol','Tablet','500mg',30,480,100,1,${at(60)},${at(60)}),
 (2,'Amoxicillin','Capsule','250mg',80,240,60,1,${at(60)},${at(60)}),
 (3,'Artemether/Lumefantrine','Tablet','20/120mg',150,180,40,1,${at(60)},${at(60)}),
 (4,'Metronidazole','Tablet','400mg',50,300,60,1,${at(60)},${at(60)}),
 (5,'Ibuprofen','Tablet','400mg',60,220,50,1,${at(60)},${at(60)}),
 (6,'Oral Rehydration Salts','Sachet','20.5g',200,140,40,1,${at(60)},${at(60)}),
 (7,'Cotrimoxazole','Tablet','480mg',40,320,60,1,${at(60)},${at(60)}),
 (8,'Diclofenac','Tablet','50mg',70,160,40,1,${at(60)},${at(60)}),
 (9,'Amlodipine','Tablet','5mg',90,90,40,1,${at(60)},${at(60)}),
 (10,'Metformin','Tablet','500mg',50,150,40,1,${at(60)},${at(60)}),
 (11,'Ceftriaxone','Injection','1g',1200,24,20,1,${at(60)},${at(60)}),
 (12,'Normal Saline','Infusion','500ml',800,18,20,1,${at(60)},${at(60)}),
 (13,'Ferrous Sulphate','Tablet','200mg',25,260,60,1,${at(60)},${at(60)}),
 (14,'Folic Acid','Tablet','5mg',20,300,60,1,${at(60)},${at(60)}),
 (15,'Salbutamol Inhaler','Inhaler','100mcg',2500,8,10,1,${at(60)},${at(60)});

INSERT OR IGNORE INTO visits (id, visit_no, patient_id, reason, status, doctor_id, nurse_id, consultation_completed, follow_up, created_by, created_at, updated_at, closed_at) VALUES
 (1,'V-DEMO-0001',6,'General body pains and chills for three days','awaiting_nursing',NULL,NULL,0,NULL,7,${at(0,25)},${at(0,25)},NULL),
 (2,'V-DEMO-0002',9,'Headache and elevated blood pressure reading','awaiting_doctor',2,3,0,NULL,7,${at(0,110)},${at(0,95)},NULL),
 (3,'V-DEMO-0003',1,'Fever, headache and general weakness','consulting',2,3,0,NULL,7,${at(0,150)},${at(0,40)},NULL),
 (4,'V-DEMO-0004',3,'Fever with chills and cough','awaiting_lab',2,3,1,'Review with laboratory results today.',7,${at(0,240)},${at(0,180)},NULL),
 (5,'V-DEMO-0005',8,'Stomach pain and diarrhoea','awaiting_pharmacy',2,3,1,'Return if symptoms persist beyond 3 days.',7,${at(0,330)},${at(0,260)},NULL),
 (6,'V-DEMO-0006',2,'Hypertension review and refill','awaiting_payment',2,3,1,'Review in 4 weeks with BP diary.',7,${at(0,420)},${at(0,360)},NULL),
 (7,'V-DEMO-0007',4,'Fever and joint pains','completed',2,3,1,'Review in 1 week if fever persists.',7,${at(0,600)},${at(0,475)},${at(0,470)}),
 (8,'V-DEMO-0008',7,'Ear pain and fever','completed',2,3,1,'Review in 5 days or earlier if pain worsens.',7,${at(3,240)},${at(3,200)},${at(3,195)}),
 (9,'V-DEMO-0009',10,'Sprained ankle after a fall','completed',2,3,1,'Return if swelling or pain worsens.',7,${at(9,300)},${at(9,250)},${at(9,245)});

INSERT OR IGNORE INTO invoices (id, invoice_no, visit_id, patient_id, total, status, created_by, created_at, updated_at) VALUES
 (1,'INV-2026-00001',1,6,0,'open',7,${at(0,25)},${at(0,25)}),
 (2,'INV-2026-00002',2,9,0,'open',7,${at(0,110)},${at(0,110)}),
 (3,'INV-2026-00003',3,1,0,'open',7,${at(0,150)},${at(0,150)}),
 (4,'INV-2026-00004',4,3,16500,'open',7,${at(0,240)},${at(0,170)}),
 (5,'INV-2026-00005',5,8,11730,'open',7,${at(0,330)},${at(0,240)}),
 (6,'INV-2026-00006',6,2,15700,'partial',7,${at(0,420)},${at(0,240)}),
 (7,'INV-2026-00007',7,4,12400,'paid',7,${at(0,600)},${at(0,475)}),
 (8,'INV-2026-00008',8,7,6200,'paid',7,${at(3,240)},${at(3,195)}),
 (9,'INV-2026-00009',9,10,24000,'paid',7,${at(9,300)},${at(9,245)});

INSERT OR IGNORE INTO invoice_items (id, invoice_id, service_id, description, category, unit_price, quantity, amount, source_type, source_id, status, created_by, created_at) VALUES
 (1,4,1,'General Consultation','Consultation',5000,1,5000,'consultation',4,'active',2,${at(0,180)}),
 (2,4,7,'Malaria Rapid Test','Laboratory',3500,1,3500,'lab',1,'active',2,${at(0,170)}),
 (3,4,8,'Full Blood Count','Laboratory',8000,1,8000,'lab',2,'active',2,${at(0,170)}),
 (4,5,1,'General Consultation','Consultation',5000,1,5000,'consultation',5,'active',2,${at(0,260)}),
 (5,5,11,'Typhoid Test (Widal)','Laboratory',4000,1,4000,'lab',3,'active',2,${at(0,250)}),
 (6,5,NULL,'Amoxicillin × 21 (250mg)','Pharmacy',80,21,1680,'pharmacy',1,'active',5,${at(0,240)}),
 (7,5,NULL,'Metronidazole × 21 (400mg)','Pharmacy',50,21,1050,'pharmacy',2,'active',5,${at(0,240)}),
 (8,6,1,'General Consultation','Consultation',5000,1,5000,'consultation',6,'active',2,${at(0,360)}),
 (9,6,8,'Full Blood Count','Laboratory',8000,1,8000,'lab',4,'active',2,${at(0,350)}),
 (10,6,NULL,'Amlodipine × 30 (5mg)','Pharmacy',90,30,2700,'pharmacy',3,'active',5,${at(0,300)}),
 (11,7,1,'General Consultation','Consultation',5000,1,5000,'consultation',7,'active',2,${at(0,540)}),
 (12,7,7,'Malaria Rapid Test','Laboratory',3500,1,3500,'lab',5,'active',2,${at(0,530)}),
 (13,7,NULL,'Artemether/Lumefantrine × 24 (20/120mg)','Pharmacy',150,24,3600,'pharmacy',4,'active',5,${at(0,500)}),
 (14,7,NULL,'Paracetamol × 10 (500mg)','Pharmacy',30,10,300,'pharmacy',5,'active',5,${at(0,500)}),
 (15,8,1,'General Consultation','Consultation',5000,1,5000,'consultation',8,'active',2,${at(3,210)}),
 (16,8,NULL,'Amoxicillin × 15 (250mg)','Pharmacy',80,15,1200,'pharmacy',6,'active',5,${at(3,198)}),
 (17,9,1,'General Consultation','Consultation',5000,1,5000,'consultation',9,'active',2,${at(9,270)}),
 (18,9,5,'Wound Dressing','Nursing',4000,1,4000,'service',NULL,'active',3,${at(9,260)}),
 (19,9,15,'Chest X-Ray','Imaging',15000,1,15000,'service',NULL,'active',2,${at(9,260)});

INSERT OR IGNORE INTO vitals (id, visit_id, bp_systolic, bp_diastolic, temperature, pulse, resp_rate, spo2, weight, height, glucose, complaints, recorded_by, recorded_at, updated_at) VALUES
 (1,2,158,96,36.8,88,18,98,74.5,1.62,NULL,'Recurrent headaches for two weeks, feels dizzy when standing. Takes amlodipine irregularly.',3,${at(0,95)},${at(0,95)}),
 (2,3,112,74,38.9,104,20,97,61.2,1.66,5.4,'High fever since yesterday, severe headache, no vomiting. Has not taken any medication.',3,${at(0,135)},${at(0,135)}),
 (3,4,104,68,39.2,110,24,96,55.8,1.59,NULL,'Fever and chills for two days, dry cough, body weakness.',3,${at(0,225)},${at(0,225)}),
 (4,5,118,76,37.4,92,18,99,68.0,1.75,NULL,'Watery stools four times today, mild abdominal cramps, no blood in stool.',3,${at(0,315)},${at(0,315)}),
 (5,6,148,94,36.5,79,16,99,81.3,1.71,NULL,'Runs out of amlodipine, occasional morning headaches. No chest pain.',3,${at(0,405)},${at(0,405)}),
 (6,7,132,84,38.4,96,19,98,72.4,1.68,7.8,'Fever, joint pains and fatigue for three days. Known diabetic.',3,${at(0,585)},${at(0,585)}),
 (7,8,96,62,38.1,112,22,98,24.5,1.18,NULL,'Right ear pain and fever for two days, reduced appetite.',3,${at(3,228)},${at(3,228)}),
 (8,9,122,78,36.7,76,16,99,66.9,1.78,NULL,'Twisted right ankle yesterday, painful and slightly swollen.',3,${at(9,288)},${at(9,288)});

INSERT OR IGNORE INTO consultations (id, visit_id, doctor_id, symptoms, clinical_notes, diagnosis, treatment_plan, follow_up_instructions, consultation_service_id, completed, created_at, updated_at, completed_at) VALUES
 (1,3,2,'Fever 38.9°C, headache, malaise. No cough, no rash.','Alert and hydrated. Chest clear. Abdomen soft, non-tender. No neck stiffness.',NULL,NULL,NULL,NULL,0,${at(0,40)},${at(0,40)},NULL),
 (2,4,2,'Fever, chills, dry cough, anorexia.','Febrile, chest clear, no consolidation. Mild pharyngeal congestion.','Suspected malaria with upper respiratory tract infection','Investigate malaria and full blood count. Analgesia and oral fluids.','Review with laboratory results today.',1,1,${at(0,180)},${at(0,180)},${at(0,180)}),
 (3,5,2,'Acute watery diarrhoea, abdominal cramps, no vomiting.','Mildly dehydrated, abdomen soft and non-tender. No guarding.','Acute gastroenteritis - suspected typhoid','Widal test, oral rehydration, antibiotics.','Return if symptoms persist beyond 3 days.',1,1,${at(0,260)},${at(0,260)},${at(0,260)}),
 (4,6,2,'Occasional morning headaches. Adherent to medication for the past month.','BP 148/94. Heart sounds normal, no pedal oedema. Chest clear.','Essential hypertension - suboptimal control','Continue amlodipine, lifestyle counselling, review in 4 weeks.','Review in 4 weeks with BP diary.',1,1,${at(0,360)},${at(0,360)},${at(0,360)}),
 (5,7,2,'Fever, generalized joint pains, fatigue.','Febrile, joints not swollen. Random glucose 7.8 mmol/L.','Malaria','Malaria RDT, artemether/lumefantrine, paracetamol. Continue metformin.','Review in 1 week if fever persists.',1,1,${at(0,540)},${at(0,540)},${at(0,540)}),
 (6,8,2,'Right ear pain, fever, poor appetite.','Right tympanic membrane erythematous. No discharge. Throat mildly inflamed.','Acute otitis media','Amoxicillin syrup, paracetamol, review in 5 days.','Review in 5 days or earlier if pain worsens.',1,1,${at(3,210)},${at(3,210)},${at(3,210)}),
 (7,9,2,'Right ankle pain and swelling after a fall.','Mild lateral malleolar swelling, no bony tenderness, range of movement limited by pain.','Ankle sprain','Dressing, analgesia, rest and elevation.','Return if swelling or pain worsens.',1,1,${at(9,270)},${at(9,270)},${at(9,270)});

INSERT OR IGNORE INTO lab_requests (id, visit_id, patient_id, service_id, test_name, price, status, requested_by, requested_at, result, result_notes, resulted_by, resulted_at, invoice_item_id) VALUES
 (1,4,3,7,'Malaria Rapid Test',3500,'pending',2,${at(0,170)},NULL,NULL,NULL,NULL,2),
 (2,4,3,8,'Full Blood Count',8000,'in_progress',2,${at(0,170)},NULL,NULL,NULL,NULL,3),
 (3,5,8,11,'Typhoid Test (Widal)',4000,'completed',2,${at(0,250)},'Widal O 1:160, H 1:160 - suggestive of typhoid',NULL,6,${at(0,245)},5),
 (4,6,2,8,'Full Blood Count',8000,'completed',2,${at(0,350)},'Hb 13.4 g/dL, WBC 6.8 ×10⁹/L, Platelets 240 ×10⁹/L - normal',NULL,6,${at(0,345)},9),
 (5,7,4,7,'Malaria Rapid Test',3500,'completed',2,${at(0,530)},'Malaria RDT: positive (Pf)',NULL,6,${at(0,520)},12);

INSERT OR IGNORE INTO prescriptions (id, visit_id, patient_id, medication_id, drug_name, dosage, frequency, duration, quantity, instructions, status, price, prescribed_by, prescribed_at, dispensed_by, dispensed_at, invoice_item_id) VALUES
 (1,5,8,2,'Amoxicillin','500mg','Three times daily','7 days',21,'Take as directed','pending',80,2,${at(0,240)},NULL,NULL,NULL),
 (2,5,8,4,'Metronidazole','400mg','Three times daily','7 days',21,'Take as directed','pending',50,2,${at(0,240)},NULL,NULL,NULL),
 (3,6,2,9,'Amlodipine','5mg','Once daily at night','30 days',30,'Take as directed','dispensed',90,2,${at(0,345)},5,${at(0,300)},10),
 (4,7,4,3,'Artemether/Lumefantrine','20/120mg','Twice daily','3 days',24,'Take as directed','dispensed',150,2,${at(0,525)},5,${at(0,500)},13),
 (5,7,4,1,'Paracetamol','500mg','Three times daily','3 days',10,'Take as directed','dispensed',30,2,${at(0,524)},5,${at(0,500)},14),
 (6,8,7,2,'Amoxicillin','250mg','Three times daily','5 days',15,'Take as directed','dispensed',80,2,${at(3,216)},5,${at(3,198)},16);

INSERT OR IGNORE INTO payments (id, receipt_no, invoice_id, patient_id, amount, method, momo_reference, received_by, paid_at, notes, status, reversed_by, reversed_at, reversal_reason, created_at) VALUES
 (1,'RCPT-2026-00001',6,2,10000,'cash',NULL,4,${at(0,240)},NULL,'confirmed',NULL,NULL,NULL,${at(0,240)}),
 (2,'RCPT-2026-00002',7,4,6000,'momo','MP240913.1422.A88210',4,${at(0,480)},NULL,'confirmed',NULL,NULL,NULL,${at(0,480)}),
 (3,'RCPT-2026-00003',7,4,6400,'cash',NULL,4,${at(0,475)},NULL,'confirmed',NULL,NULL,NULL,${at(0,475)}),
 (4,'RCPT-2026-00004',8,7,6200,'momo','MP240910.0918.B12940',4,${at(3,240)},NULL,'confirmed',NULL,NULL,NULL,${at(3,240)}),
 (5,'RCPT-2026-00005',9,10,24000,'cash',NULL,4,${at(9,240)},NULL,'confirmed',NULL,NULL,NULL,${at(9,240)});

INSERT OR IGNORE INTO counters (key, value) VALUES ('patient',10),('invoice:2026',9),('receipt:2026',5);
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema','1');
`;

async function execSql(env, sql) {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50).map((s) => env.DB.prepare(s)));
  }
}

let initPromise = null;

export async function ensureDb(env) {
  if (!initPromise) {
    initPromise = initDb(env).catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

async function initDb(env) {
  let ready = false;
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first();
    ready = !!row;
  } catch {
    ready = false;
  }
  if (!ready) {
    await execSql(env, SCHEMA);
  }
  const stale = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM staff WHERE password_hash LIKE 'pbkdf2$120000$%'",
  ).first();
  if (stale && Number(stale.c) > 0) {
    await env.DB.prepare("DELETE FROM meta WHERE key = 'seeded'").run();
  }
  const seeded = await env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'").first().catch(() => null);
  if (!seeded) {
    await execSql(env, SEED);
    await env.DB.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', '1')").run();
  }
}

/* ------------------------------ passwords -------------------------------- */

const encoder = new TextEncoder();

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function derive(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(saltHex), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(password, salt, 100000);
  return `pbkdf2$100000$${salt}$${hash}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations)) return false;
  const actual = await derive(password, parts[2], iterations);
  const expected = parts[3];
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------- sessions -------------------------------- */

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

function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`;
}

export async function createSession(env, staffId) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_HOURS * 3600 * 1000);
  await run(
    env,
    'INSERT INTO sessions (token, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    token,
    staffId,
    created.toISOString(),
    expires.toISOString(),
  );
  return sessionCookie(token, SESSION_HOURS * 3600);
}

export async function destroySession(env, request) {
  const token = parseCookies(request.headers.get('Cookie') || '')[COOKIE];
  if (token) await run(env, 'DELETE FROM sessions WHERE token = ?', token);
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export async function currentStaff(env, request) {
  const token = parseCookies(request.headers.get('Cookie') || '')[COOKIE];
  if (!token) return null;
  const session = await first(env, 'SELECT * FROM sessions WHERE token = ?', token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await run(env, 'DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  const staff = await first(env, 'SELECT * FROM staff WHERE id = ?', session.staff_id);
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

/* -------------------------------- numbers --------------------------------- */

export async function nextSeq(env, key) {
  const row = await first(
    env,
    `INSERT INTO counters (key, value) VALUES (?, 1)
     ON CONFLICT(key) DO UPDATE SET value = value + 1
     RETURNING value`,
    key,
  );
  return Number(row.value);
}

export async function patientNo(env) {
  return `GH-${pad(await nextSeq(env, 'patient'), 4)}`;
}

export async function visitNo(env, date = new Date()) {
  const stamp = todayStr(date).replaceAll('-', '');
  return `V-${stamp}-${pad(await nextSeq(env, `visit:${stamp}`), 4)}`;
}

export async function invoiceNo(env) {
  const year = new Date().getUTCFullYear();
  return `INV-${year}-${pad(await nextSeq(env, `invoice:${year}`), 5)}`;
}

export async function receiptNo(env) {
  const year = new Date().getUTCFullYear();
  return `RCPT-${year}-${pad(await nextSeq(env, `receipt:${year}`), 5)}`;
}

/* -------------------------------- billing --------------------------------- */

export async function invoiceTotals(env, invoiceId) {
  const total = Number(
    (await first(env, "SELECT COALESCE(SUM(amount),0) AS t FROM invoice_items WHERE invoice_id = ? AND status = 'active'", invoiceId)).t,
  );
  const paid = Number(
    (await first(env, "SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE invoice_id = ? AND status = 'confirmed'", invoiceId)).t,
  );
  return { total, paid, balance: Math.max(total - paid, 0) };
}

export async function recalcInvoice(env, invoiceId) {
  const invoice = await first(env, 'SELECT * FROM invoices WHERE id = ?', invoiceId);
  if (!invoice) return null;
  const totals = await invoiceTotals(env, invoiceId);
  let status = invoice.status;
  if (status !== 'cancelled') {
    if (totals.paid > 0 && totals.paid < totals.total) status = 'partial';
    else if (totals.total > 0 && totals.paid >= totals.total) status = 'paid';
    else if (totals.paid > 0) status = 'paid';
    else status = 'open';
  }
  await run(env, 'UPDATE invoices SET total = ?, status = ?, updated_at = ? WHERE id = ?', totals.total, status, nowIso(), invoiceId);
  return { ...totals, status };
}

export async function addInvoiceItem(env, item) {
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const unitPrice = Math.max(0, Math.round(Number(item.unitPrice) || 0));
  const amount = unitPrice * quantity;
  const info = await run(
    env,
    `INSERT INTO invoice_items
     (invoice_id, service_id, description, category, unit_price, quantity, amount, source_type, source_id, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    item.invoiceId,
    item.serviceId ?? null,
    item.description,
    item.category || 'Other',
    unitPrice,
    quantity,
    amount,
    item.sourceType || 'manual',
    item.sourceId ?? null,
    item.staffId ?? null,
    nowIso(),
  );
  await recalcInvoice(env, item.invoiceId);
  return Number(info.meta.last_row_id);
}

export async function visitPendingCounts(env, visitId) {
  const labs = Number(
    (await first(env, "SELECT COUNT(*) AS c FROM lab_requests WHERE visit_id = ? AND status IN ('pending','in_progress')", visitId)).c,
  );
  const rx = Number(
    (await first(env, "SELECT COUNT(*) AS c FROM prescriptions WHERE visit_id = ? AND status = 'pending'", visitId)).c,
  );
  return { labs, rx };
}

export async function advanceVisit(env, visitId) {
  const visit = await first(env, 'SELECT * FROM visits WHERE id = ?', visitId);
  if (!visit) return;
  if (['cancelled', 'completed'].includes(visit.status)) return;
  if (!visit.consultation_completed) return;
  const { labs, rx } = await visitPendingCounts(env, visitId);
  const invoice = await first(env, 'SELECT * FROM invoices WHERE visit_id = ?', visitId);
  const totals = invoice ? await invoiceTotals(env, invoice.id) : { balance: 0 };
  let status = 'completed';
  if (labs > 0) status = 'awaiting_lab';
  else if (rx > 0) status = 'awaiting_pharmacy';
  else if (totals.balance > 0) status = 'awaiting_payment';
  await run(
    env,
    'UPDATE visits SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?',
    status,
    nowIso(),
    status === 'completed' ? nowIso() : null,
    visitId,
  );
}

export async function audit(env, staff, action, entity, entityId, details) {
  await run(
    env,
    `INSERT INTO audit_logs (staff_id, staff_name, action, entity, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    staff?.id ?? null,
    staff?.full_name ?? 'System',
    action,
    entity ?? null,
    entityId ?? null,
    details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
    nowIso(),
  );
}

/* ------------------------------- validation ------------------------------- */

export function requireFields(body, fields) {
  for (const field of fields) {
    const value = body?.[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      fail(`${field.replaceAll('_', ' ')} is required`);
    }
  }
}

export function cleanPhone(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const phone = String(value).replace(/[\s-]/g, '');
  if (!/^(\+233\d{9}|0\d{9})$/.test(phone)) {
    fail('Enter a valid Ghanaian phone number (e.g. 024 123 4567 or +233241234567)');
  }
  return phone;
}

export function cleanDate(value, label = 'date') {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || date.length !== 10) fail(`Enter a valid ${label}`);
  return date;
}

export function int(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function num(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(`${String(dob).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
