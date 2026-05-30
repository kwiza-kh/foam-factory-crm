import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './db.js';
import customersRouter from './routes/customers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

async function initDb() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema ready.');
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/customers', customersRouter);

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
      ? 'PostgreSQL 未启动或未安装（连接被拒绝）'
      : (err.message || JSON.stringify(err));
    console.error('DB init failed:', msg);
    console.error('请检查：1) PostgreSQL 是否已启动  2) .env 中 DATABASE_URL 是否正确  3) 数据库是否已创建');
    process.exit(1);
  });
