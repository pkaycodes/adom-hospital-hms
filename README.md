# Adom Hospital HMS

A hospital management system for Ghanaian clinics and small hospitals — reception, nursing, consultations, laboratory, pharmacy, billing and finance in one place.

The system follows a real clinic visit from arrival to payment: a receptionist opens a visit, a nurse records vitals, a doctor consults and orders tests or drugs, the lab posts results, the pharmacy dispenses, and the cashier takes payment. Every role sees only the screens and actions it needs.

## What's inside

- **Reception and patients** — register patients with Ghana Card and NHIS details, open visits, search the patient book, and keep allergies and conditions on the record.
- **Nursing** — a live queue, vitals capture (blood pressure, temperature, pulse, respiration, SpO₂, weight, height, glucose) and visit hand-off.
- **Doctor's queue and consultation** — start a consultation, record symptoms, clinical notes, diagnosis and treatment plan, order lab tests, prescribe medication, and print a consultation summary.
- **Laboratory** — request tests from a priced service list, work the pending queue, and post results and notes against the visit.
- **Pharmacy** — dispense or mark prescriptions unavailable, manage the medication catalogue, and track stock with reorder levels and restocking.
- **Billing and payments** — invoices build themselves from consultations, labs and prescriptions; take cash or Mobile Money payments, reverse a payment with a reason, and print receipts and invoices.
- **Finance** — daily revenue, cash and MoMo split, cashier breakdown, outstanding balances and date-range reporting.
- **Administration** — staff accounts and roles, service prices, clinic settings, low-stock alerts and an audit log of sensitive actions.
- **Backups** — an administrator can download a consistent SQLite snapshot from the app.

## Roles

| Role | What they can do |
| --- | --- |
| Administrator | Everything, including staff, services, settings, audit and backups |
| Doctor | Consultations, lab requests, prescriptions, read-only billing |
| Nurse | Patient queue and vitals |
| Cashier | Invoices, payments and finance |
| Pharmacist | Dispensing and medication inventory |
| Laboratory technician | Lab queue and results |
| Receptionist | Patient registration and visits |
| Other staff | Basic patient and visit access |

Permissions are enforced on the server, not only by hiding buttons in the interface.

## Stack

- **Server:** Node.js, Express 4, `node:sqlite` (built into Node 22.5+)
- **Client:** React 18, TypeScript, Vite, React Router, Lucide icons, hand-written CSS
- **Database:** SQLite in WAL mode, with foreign keys and an audit trail
- **Cloud build:** the same API and UI can run as a Cloudflare Worker with D1 and static assets

There is no external database, ORM or UI framework to install.

## Run it locally

Requires **Node.js 22.5+** for the built-in `node:sqlite` module.

```bash
npm install
npm run dev
```

- App: <http://localhost:5173>
- API: <http://localhost:4174>
- Health check: <http://localhost:4174/api/health>

The first run creates `data/hms.db` and loads a full set of sample patients, visits, invoices, payments, lab requests and prescriptions so every screen has something to show.

### Demo accounts

The seed data ships with one account per role. These are demo credentials — change or remove them before using the system with real patient data.

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `Admin@123` | Administrator |
| `dr.mensah` | `Doctor@123` | Doctor |
| `nurse.adu` | `Nurse@123` | Nurse |
| `cashier.owusu` | `Cashier@123` | Cashier |
| `pharm.boateng` | `Pharma@123` | Pharmacist |
| `lab.asante` | `Lab@123` | Laboratory technician |
| `reception` | `Reception@123` | Receptionist |
| `records` | `Records@123` | Records officer |

### Resetting the sample data

`npm run seed` **deletes** the existing database and reloads the sample data. Do not run it against a database you want to keep.

```bash
npm run seed
```

## Production

Build the client and run the Express server:

```bash
npm run build
NODE_ENV=production npm start
```

The server serves the built client from `dist/` and the API from `/api`. Set `PORT`, `HOST` and `HMS_DATA_DIR` if you need different paths, and put the app behind HTTPS before exposing it outside a trusted network.

### Cloudflare build

```bash
npm run build:cloud
```

This produces the client in `dist/` and a bundled Worker in `build/worker.js`. The included `sites.manifest.json` describes the Worker entrypoint, ES module bundle and static assets. Bind a D1 database as `DB` and the static asset directory as `ASSETS`; the Worker creates its schema and seed data on first request.

## Project layout

```
server/          Express API, SQLite schema, seed data and routes
worker/          Cloudflare Worker port of the API (D1)
web/             React + TypeScript client
web/src/pages/   Dashboard, reception, nursing, doctor, lab, pharmacy, billing, admin
sites.manifest.json
```

## Notes

- Money is stored in pesewas and displayed in Ghana cedis.
- Patient numbers, visit numbers, invoice numbers and receipt numbers are generated by the server.
- Passwords are hashed with scrypt on the Node server and PBKDF2 on the Worker; sessions are stored server-side and expire.
- The audit log records logins, clinical changes, payments, reversals and administrative actions.
- This is a working application, not a certified medical device. Review your local privacy, retention and clinical requirements before using it with real patients.
