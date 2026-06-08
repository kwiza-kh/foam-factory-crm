import prismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const { PrismaClient } = prismaClientPkg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and set your PostgreSQL password.');
}

const { password } = new URL(connectionString);

if (typeof password !== 'string' || password.length === 0) {
  throw new Error('DATABASE_URL must include a PostgreSQL password, for example postgresql://postgres:password@localhost:5432/foam_crm');
}

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: {
    maxWait: 10000,
    timeout: 60000,
  },
});
