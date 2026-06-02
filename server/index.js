import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { prisma } from './db.js';
import customersRouter from './routes/customers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

async function initDb() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const statements = schema
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log('Database schema ready.');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/customers', customersRouter);

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Uploaded data is too large. Please import a smaller file or split it into batches.' });
  }
  next(err);
});

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(join(distPath, 'index.html')));
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => {
    const msg = err.code === 'ECONNREFUSED'
      ? 'PostgreSQL is not running or is not installed (connection refused).'
      : (err.message || JSON.stringify(err));
    console.error('DB init failed:', msg);
    console.error('Check: 1) PostgreSQL is running  2) DATABASE_URL in .env is correct  3) the database exists');
    process.exit(1);
  });
