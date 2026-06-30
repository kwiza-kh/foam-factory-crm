import prismaClientPkg from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import "dotenv/config";
import { createMySqlAdapterConfig } from "./dbConfig.js";

const { PrismaClient } = prismaClientPkg;
const { connectionString, database } = createMySqlAdapterConfig(process.env.DATABASE_URL);

const adapter = new PrismaMariaDb(connectionString, { database });

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: {
    maxWait: 10000,
    timeout: 60000,
  },
});
