import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.HMS_DATA_DIR || path.join(here, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const dbPath = path.join(dataDir, 'hms.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

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
  staff_id INTEGER NOT NULL REFERENCES staff(id),
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
  patient_id INTEGER NOT NULL REFERENCES patients(id),
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
  visit_id INTEGER NOT NULL UNIQUE REFERENCES visits(id),
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
  visit_id INTEGER NOT NULL UNIQUE REFERENCES visits(id),
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
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
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
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
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
  visit_id INTEGER NOT NULL UNIQUE REFERENCES visits(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
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
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
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
`);

const settingsColumns = db.prepare('PRAGMA table_info(settings)').all().map((c) => c.name);
if (!settingsColumns.includes('logo_url')) {
  db.exec('ALTER TABLE settings ADD COLUMN logo_url TEXT');
}

const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
if (!settingsRow) {
  db.prepare(
    `INSERT INTO settings (id, name, address, phone, email, momo_number, logo_text, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'Adom Memorial Clinic',
    '12 Ring Road Central, Accra, Greater Accra',
    '0302 555 120',
    'info@adomclinic.com.gh',
    '024 555 0120',
    'AM',
    new Date().toISOString(),
  );
}
