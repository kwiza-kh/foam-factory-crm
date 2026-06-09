import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { prisma } from './db.js';
import { authMiddleware } from './auth.js';
import customersRouter from './routes/customers.js';
import usersRouter from './routes/users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// Verify database connectivity on startup (schema managed by Prisma: use `npm run db:push`)
async function checkDb() {
  await prisma.$queryRaw`SELECT 1`;
  console.log('Database connection verified.');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/users', usersRouter);
app.use('/api/customers', authMiddleware, customersRouter);

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

checkDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => {
    const msg = err.code === 'ECONNREFUSED'
      ? 'PostgreSQL is not running or is not installed (connection refused).'
      : (err.message || JSON.stringify(err));
    console.error('DB connection failed:', msg);
    console.error('Check: 1) PostgreSQL is running  2) DATABASE_URL in .env is correct  3) the database exists');
    console.error('Run `npm run db:push` to ensure the schema is up to date.');
    process.exit(1);
  });
