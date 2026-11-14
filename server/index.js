import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { pruneSessions } from './auth.js';
import { seedIfEmpty } from './seed.js';
import authRoutes from './routes/auth.js';
import patientRoutes from './routes/patients.js';
import visitRoutes from './routes/visits.js';
import labRoutes from './routes/lab.js';
import pharmacyRoutes from './routes/pharmacy.js';
import billingRoutes from './routes/billing.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

seedIfEmpty();
pruneSessions();
setInterval(pruneSessions, 60 * 60 * 1000).unref();

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    patients: db.prepare('SELECT COUNT(*) AS c FROM patients').get().c,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', billingRoutes);
app.use('/api', adminRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

const dist = path.join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// Central error handler: never leak stack traces; answer with JSON for the API.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[api]', err);
  if (req.path.startsWith('/api')) {
    res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
  } else {
    res.status(status).send('Something went wrong');
  }
});

const port = Number(process.env.PORT) || 4174;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Hospital Management System API listening on http://localhost:${port}`);
});
