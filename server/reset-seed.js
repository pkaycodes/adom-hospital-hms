import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.HMS_DATA_DIR || path.join(here, '..', 'data');

for (const file of ['hms.db', 'hms.db-wal', 'hms.db-shm']) {
  const full = path.join(dataDir, file);
  if (existsSync(full)) rmSync(full);
}

const { seedIfEmpty } = await import('./seed.js');
const seeded = seedIfEmpty();
console.log(seeded ? 'Database reset and sample data loaded.' : 'Database already has data.');
